from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import MarkupRule, PalletRate, Shipment, User, WalletTx, new_id
from ..pdfs import labels_pdf, month_bounds
from ..pricing import (
    COURIERS,
    DEFAULT_PALLET_RATES,
    client_overrides,
    pallet_price,
    standard_rules,
    zones_payload,
)
from ..schemas import (
    AdminKpis,
    AdminMonth,
    ClientCreate,
    ClientMarkup,
    ClientMarkupBody,
    ClientRow,
    ClientStatusBody,
    CourierSplit,
    MarkupRule as MarkupRuleOut,
    MarkupRulesBody,
    PalletRate as PalletRateOut,
    PalletRatesBody,
    PalletRatesResponse,
    ResellerShipment,
    ShipmentCreate,
    WalletAdjustBody,
)
from ..security import hash_password
from ..serializers import client_row, shipment_out
from ..shipments import (
    advance_tracking,
    create_shipment,
    is_travelbox_shipment,
    remove_travelbox_cart_item,
    sync_travelbox_shipments,
    travelbox_label,
)

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger("muvpack.admin")

COURIER_ORDER = ["poste", "brt", "dhl"]


def _month_key(value: datetime) -> str:
    return value.strftime("%Y-%m")


def _all_shipments(db: Session) -> list[Shipment]:
    return list(db.scalars(select(Shipment).where(Shipment.is_admin_shipment.is_(False))))


def _client_row(db: Session, user: User) -> ClientRow:
    shipments = list(
        db.scalars(
            select(Shipment).where(
                Shipment.owner_id == user.id, Shipment.is_admin_shipment.is_(False)
            )
        )
    )
    overrides = db.scalar(
        select(MarkupRule.id).where(MarkupRule.client_id == user.id).limit(1)
    )
    custom = len(client_overrides(db, user.id)) if overrides else 0
    return client_row(
        user,
        shipments=len(shipments),
        revenue=sum(s.price for s in shipments),
        custom_markups=custom,
    )


@router.get("/kpis", response_model=AdminKpis)
def kpis(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    shipments = _all_shipments(db)
    revenue = sum(s.price for s in shipments)
    costs = sum(s.base_cost + s.fuel_surcharge for s in shipments)
    profit = revenue - costs

    now = datetime.now(timezone.utc)
    monthly: list[AdminMonth] = []
    for offset in range(5, -1, -1):
        year, month = now.year, now.month - offset
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year:04d}-{month:02d}"
        selected = [s for s in shipments if _month_key(s.created_at) == key]
        monthly.append(
            AdminMonth(
                month=key,
                revenue=round(sum(s.price for s in selected), 2),
                costs=round(sum(s.base_cost + s.fuel_surcharge for s in selected), 2),
            )
        )

    by_courier = [
        CourierSplit(
            courier=courier,  # type: ignore[arg-type]
            shipments=sum(1 for s in shipments if s.courier == courier),
            revenue=round(sum(s.price for s in shipments if s.courier == courier), 2),
        )
        for courier in COURIER_ORDER
    ]

    active_clients = db.scalar(
        select(User.id).where(User.role == "reseller", User.status == "active").limit(1)
    )
    active_clients_count = len(
        list(db.scalars(select(User.id).where(User.role == "reseller", User.status == "active")))
    )

    return AdminKpis(
        total_revenue=round(revenue, 2),
        courier_costs=round(costs, 2),
        net_profit=round(profit, 2),
        net_margin_pct=round(profit / revenue * 100, 1) if revenue else 0.0,
        total_shipments=len(shipments),
        active_clients=active_clients_count,
        monthly=monthly,
        by_courier=by_courier,
    )


@router.get("/clients", response_model=list[ClientRow])
def clients(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.role == "reseller").order_by(User.created_at.desc()))
    return [_client_row(db, user) for user in users]


@router.post("/clients", response_model=ClientRow, status_code=201)
def create_client(body: ClientCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    vat = body.vat_number.replace(" ", "").upper()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email gia registrata")
    if db.scalar(select(User).where(User.vat_number == vat)):
        raise HTTPException(status_code=409, detail="Partita IVA gia registrata")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        role="reseller",
        company_name=body.company_name.strip(),
        vat_number=vat,
        wallet_balance=round(body.initial_balance, 2),
        status="active",
        self_registered=False,
    )
    db.add(user)
    db.flush()
    if body.initial_balance:
        db.add(
            WalletTx(
                user_id=user.id,
                type="admin_adjust",
                amount=round(body.initial_balance, 2),
                ref=None,
                note="Credito iniziale",
                balance_after=user.wallet_balance,
            )
        )
    db.commit()
    db.refresh(user)
    return _client_row(db, user)


@router.patch("/clients/{client_id}/status", response_model=ClientRow)
def client_status(client_id: str, body: ClientStatusBody, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = _get_client(db, client_id)
    user.status = body.status
    db.commit()
    db.refresh(user)
    return _client_row(db, user)


@router.post("/clients/{client_id}/wallet", response_model=ClientRow)
def adjust_wallet(client_id: str, body: WalletAdjustBody, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = _get_client(db, client_id)
    amount = round(body.amount, 2)
    if amount == 0:
        raise HTTPException(status_code=422, detail="Importo non valido")
    user.wallet_balance = round(user.wallet_balance + amount, 2)
    db.add(
        WalletTx(
            user_id=user.id,
            type="admin_adjust",
            amount=amount,
            ref=None,
            note="Rettifica saldo amministrazione",
            balance_after=user.wallet_balance,
        )
    )
    db.commit()
    db.refresh(user)
    return _client_row(db, user)


def _get_client(db: Session, client_id: str) -> User:
    user = db.get(User, client_id)
    if user is None or user.role != "reseller":
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return user


@router.get("/clients/{client_id}/markup", response_model=ClientMarkup)
def get_client_markup(client_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _get_client(db, client_id)
    standard = standard_rules(db)
    overrides = client_overrides(db, client_id)
    return ClientMarkup(
        standard=[
            MarkupRuleOut(courier=c, type=standard[c][0], value=standard[c][1])  # type: ignore[arg-type]
            for c in COURIER_ORDER
        ],
        overrides=[
            MarkupRuleOut(courier=c, type=overrides[c][0], value=overrides[c][1])  # type: ignore[arg-type]
            for c in COURIER_ORDER
            if c in overrides
        ],
    )


@router.put("/clients/{client_id}/markup", response_model=ClientMarkup)
def set_client_markup(client_id: str, body: ClientMarkupBody, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _get_client(db, client_id)
    _validate_rules(body.overrides)
    for row in db.scalars(select(MarkupRule).where(MarkupRule.client_id == client_id)):
        db.delete(row)
    for rule in body.overrides:
        db.add(MarkupRule(client_id=client_id, courier=rule.courier, type=rule.type, value=rule.value))
    db.commit()
    return get_client_markup(client_id, _, db)


def _validate_rules(rules: list[MarkupRuleOut]) -> None:
    seen: set[str] = set()
    for rule in rules:
        if rule.courier in seen:
            raise HTTPException(status_code=422, detail="Regola duplicata per corriere")
        seen.add(rule.courier)


@router.get("/markup-rules", response_model=list[MarkupRuleOut])
def get_markup_rules(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rules = standard_rules(db)
    return [
        MarkupRuleOut(courier=c, type=rules[c][0], value=rules[c][1])  # type: ignore[arg-type]
        for c in COURIER_ORDER
    ]


@router.put("/markup-rules", response_model=list[MarkupRuleOut])
def set_markup_rules(body: MarkupRulesBody, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    _validate_rules(body.rules)
    for row in db.scalars(select(MarkupRule).where(MarkupRule.client_id.is_(None))):
        db.delete(row)
    for rule in body.rules:
        db.add(MarkupRule(client_id=None, courier=rule.courier, type=rule.type, value=rule.value))
    db.commit()
    return get_markup_rules(_, db)


@router.get("/pallet-rates", response_model=PalletRatesResponse)
def get_pallet_rates(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = list(db.scalars(select(PalletRate)))
    index = {(row.courier, row.zone): row.price for row in rows}
    rates = [
        PalletRateOut(courier=c, zone=z, price=index.get((c, z), DEFAULT_PALLET_RATES[(c, z)]))  # type: ignore[arg-type]
        for c in COURIER_ORDER
        for z in (1, 2, 3)
    ]
    return PalletRatesResponse(zones=zones_payload(), rates=rates)


@router.put("/pallet-rates", response_model=PalletRatesResponse)
def set_pallet_rates(body: PalletRatesBody, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    existing = {(row.courier, row.zone): row for row in db.scalars(select(PalletRate))}
    for rate in body.rates:
        row = existing.get((rate.courier, rate.zone))
        if row is None:
            db.add(PalletRate(courier=rate.courier, zone=rate.zone, price=rate.price))
        else:
            row.price = rate.price
    db.commit()
    return get_pallet_rates(_, db)


def _admin_shipment(db: Session, shipment_id: str) -> Shipment:
    shipment = db.get(Shipment, shipment_id)
    if shipment is None or not shipment.is_admin_shipment:
        raise HTTPException(status_code=404, detail="Spedizione non trovata")
    return shipment


@router.get("/shipments", response_model=list[ResellerShipment])
def admin_shipments(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    try:
        sync_travelbox_shipments(db)
    except Exception:
        logger.exception("TravelBox sync non riuscito")
    rows = list(
        db.scalars(
            select(Shipment)
            .where(Shipment.is_admin_shipment.is_(True))
            .order_by(Shipment.created_at.desc())
        )
    )
    for shipment in rows:
        advance_tracking(db, shipment)
    return [shipment_out(s) for s in rows]


@router.post("/shipments", response_model=ResellerShipment, status_code=201)
def create_admin_shipment(body: ShipmentCreate, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    shipment = create_shipment(db, user, body, as_admin=True)
    return shipment_out(shipment)


@router.delete("/shipments/{shipment_id}")
def delete_admin_shipment(
    shipment_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)
):
    shipment = _admin_shipment(db, shipment_id)
    if not is_travelbox_shipment(shipment):
        raise HTTPException(
            status_code=409, detail="Solo le spedizioni TravelBox possono essere eliminate"
        )
    if shipment.status != "creata":
        raise HTTPException(status_code=409, detail="Spedizione già confermata su TravelBox")
    try:
        removed = remove_travelbox_cart_item(shipment.tracking_code)
    except Exception:
        logger.exception("TravelBox: rimozione dal carrello non riuscita")
        raise HTTPException(
            status_code=502,
            detail="Impossibile rimuovere la spedizione dal carrello TravelBox",
        )
    db.delete(shipment)
    db.commit()
    return {"ok": True, "removed_from_travelbox": removed}


@router.get("/shipments/{shipment_id}/label")
def admin_label(shipment_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    shipment = _admin_shipment(db, shipment_id)
    if is_travelbox_shipment(shipment):
        content, media_type, filename = travelbox_label(db, shipment)
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    return Response(
        content=labels_pdf([shipment]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="etichetta-{shipment.tracking_code}.pdf"'},
    )


@router.get("/labels")
def admin_labels(ids: str = Query(...), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    wanted = [part for part in ids.split(",") if part][:100]
    shipments = [
        s
        for s in (db.get(Shipment, part) for part in wanted)
        if s is not None and s.is_admin_shipment and not is_travelbox_shipment(s)
    ]
    if not shipments:
        raise HTTPException(status_code=404, detail="Nessuna etichetta trovata")
    return Response(
        content=labels_pdf(shipments),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="etichette-muvpack.pdf"'},
    )
