from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_active_reseller, require_reseller
from ..models import Shipment, User, WalletTx
from ..pdfs import labels_pdf, month_bounds, statement_pdf, statement_xlsx
from ..schemas import MonthStat, ResellerShipment, ResellerSummary, ShipmentCreate, WalletTxOut
from ..serializers import shipment_out, wallet_tx_out
from ..shipments import advance_tracking, create_shipment

router = APIRouter(prefix="/reseller", tags=["reseller"])


def _own_shipments(db: Session, user: User) -> list[Shipment]:
    return list(
        db.scalars(
            select(Shipment)
            .where(Shipment.owner_id == user.id, Shipment.is_admin_shipment.is_(False))
            .order_by(Shipment.created_at.desc())
        )
    )


def _own_shipment(db: Session, shipment_id: str, user: User) -> Shipment:
    shipment = db.get(Shipment, shipment_id)
    if shipment is None or shipment.owner_id != user.id or shipment.is_admin_shipment:
        raise HTTPException(status_code=404, detail="Spedizione non trovata")
    return shipment


def _month_key(value: datetime) -> str:
    return value.strftime("%Y-%m")


@router.get("/summary", response_model=ResellerSummary)
def summary(user: User = Depends(require_reseller), db: Session = Depends(get_db)):
    shipments = _own_shipments(db, user)
    now = datetime.now(timezone.utc)
    current = _month_key(now)
    this_month = [s for s in shipments if _month_key(s.created_at) == current]
    months: list[MonthStat] = []
    for offset in range(5, -1, -1):
        year, month = now.year, now.month - offset
        while month <= 0:
            month += 12
            year -= 1
        key = f"{year:04d}-{month:02d}"
        selected = [s for s in shipments if _month_key(s.created_at) == key]
        months.append(
            MonthStat(
                month=key,
                shipments=len(selected),
                spent=round(sum(s.price for s in selected), 2),
            )
        )
    return ResellerSummary(
        company_name=user.company_name,
        wallet_balance=round(user.wallet_balance, 2),
        shipments_this_month=len(this_month),
        spent_this_month=round(sum(s.price for s in this_month), 2),
        in_transit=sum(1 for s in shipments if s.status in ("creata", "in_transito", "in_consegna")),
        delivered=sum(1 for s in shipments if s.status == "consegnata"),
        monthly=months,
    )


@router.get("/shipments", response_model=list[ResellerShipment])
def list_shipments(user: User = Depends(require_reseller), db: Session = Depends(get_db)):
    shipments = _own_shipments(db, user)
    for shipment in shipments:
        advance_tracking(db, shipment)
    return [shipment_out(s) for s in shipments]


@router.post("/shipments", response_model=ResellerShipment, status_code=201)
def create(body: ShipmentCreate, user: User = Depends(require_active_reseller), db: Session = Depends(get_db)):
    shipment = create_shipment(db, user, body, as_admin=False)
    return shipment_out(shipment)


@router.get("/wallet/transactions", response_model=list[WalletTxOut])
def wallet_transactions(user: User = Depends(require_reseller), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(WalletTx)
        .where(WalletTx.user_id == user.id)
        .order_by(WalletTx.created_at.desc())
    )
    return [wallet_tx_out(row) for row in rows]


@router.get("/wallet/statement")
def wallet_statement(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    format: str = Query("pdf", pattern=r"^(pdf|xlsx)$"),
    user: User = Depends(require_reseller),
    db: Session = Depends(get_db),
):
    try:
        start, end = month_bounds(month)
    except ValueError:
        raise HTTPException(status_code=422, detail="Mese non valido")
    rows = list(
        db.scalars(
            select(WalletTx)
            .where(
                WalletTx.user_id == user.id,
                WalletTx.created_at >= start,
                WalletTx.created_at < end,
            )
            .order_by(WalletTx.created_at.asc())
        )
    )
    if format == "xlsx":
        content = statement_xlsx(user, month, rows)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = f"estratto-conto-{month}.xlsx"
    else:
        content = statement_pdf(user, month, rows)
        media = "application/pdf"
        filename = f"estratto-conto-{month}.pdf"
    return Response(
        content=content,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/shipments/{shipment_id}/label")
def shipment_label(shipment_id: str, user: User = Depends(require_reseller), db: Session = Depends(get_db)):
    shipment = _own_shipment(db, shipment_id, user)
    return Response(
        content=labels_pdf([shipment]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="etichetta-{shipment.tracking_code}.pdf"'},
    )


@router.get("/labels")
def bulk_labels(ids: str = Query(...), user: User = Depends(require_reseller), db: Session = Depends(get_db)):
    wanted = [part for part in ids.split(",") if part][:100]
    shipments = [
        s
        for s in (db.get(Shipment, part) for part in wanted)
        if s is not None and s.owner_id == user.id and not s.is_admin_shipment
    ]
    if not shipments:
        raise HTTPException(status_code=404, detail="Nessuna etichetta trovata")
    return Response(
        content=labels_pdf(shipments),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="etichette-muvpack.pdf"'},
    )
