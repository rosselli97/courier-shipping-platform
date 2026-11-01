from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from travelbox.models import CreateShipmentResult, Shipment as TravelBoxShipment

from .geo import city_for_cap
from .models import Contact, Shipment, TrackingEvent, User, WalletTx
from .notify import send_shipment_email
from .pricing import COURIERS, billable_weight, quote_for_courier
from .schemas import ShipmentCreate, TravelBoxCheckoutRequest

TRAVELBOX_PREFIX = "TBC-"

logger = logging.getLogger("muvpack.travelbox.sync")

STAGES = [
    (timedelta(hours=0), "creata", "Spedizione creata", "origin"),
    (timedelta(hours=2), "in_transito", "Partita dal centro di smistamento", "origin"),
    (timedelta(hours=12), "in_transito", "In transito verso la destinazione", "hub"),
    (timedelta(hours=20), "in_consegna", "Affidata al corriere per la consegna", "dest"),
    (timedelta(hours=28), "consegnata", "Consegnata al destinatario", "dest"),
]


def ensure_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def next_tracking_code(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    prefix = f"MVP{year}"
    count = db.scalar(
        select(func.count(Shipment.id)).where(Shipment.tracking_code.like(f"{prefix}%"))
    ) or 0
    counter = count + 1
    while True:
        code = f"{prefix}{counter:04d}"
        if not db.scalar(select(Shipment.id).where(Shipment.tracking_code == code)):
            return code
        counter += 1


def _touch_contact(db: Session, user: User, body: ShipmentCreate) -> None:
    contact = db.scalar(
        select(Contact).where(
            Contact.user_id == user.id,
            Contact.name == body.recipient_name,
            Contact.address == body.recipient_address,
            Contact.cap == body.dest_cap,
        )
    )
    now = datetime.now(timezone.utc)
    if contact is None:
        contact = Contact(
            user_id=user.id,
            name=body.recipient_name,
            address=body.recipient_address,
            cap=body.dest_cap,
            city=body.dest_city or city_for_cap(body.dest_cap),
            email=body.recipient_email,
            uses=1,
            last_used_at=now,
        )
        db.add(contact)
    else:
        contact.uses += 1
        contact.last_used_at = now
        if body.recipient_email:
            contact.email = body.recipient_email


def create_shipment(db: Session, user: User, body: ShipmentCreate, as_admin: bool) -> Shipment:
    if not as_admin:
        if user.status != "active":
            raise HTTPException(status_code=403, detail="Account sospeso")
    if body.courier not in COURIERS:
        raise HTTPException(status_code=422, detail="Corriere non disponibile per la creazione locale")

    quote = quote_for_courier(db, body, body.courier, user)
    if not as_admin and user.wallet_balance < quote.price:
        raise HTTPException(status_code=402, detail="Saldo insufficiente: ricarica il portafoglio")

    shipment = Shipment(
        tracking_code=next_tracking_code(db),
        owner_id=user.id,
        is_admin_shipment=as_admin,
        courier=body.courier,
        origin_cap=body.origin_cap,
        origin_city=body.origin_city or city_for_cap(body.origin_cap),
        dest_cap=body.dest_cap,
        dest_city=body.dest_city or city_for_cap(body.dest_cap),
        recipient_name=body.recipient_name.strip(),
        recipient_address=body.recipient_address.strip(),
        recipient_email=body.recipient_email,
        weight_kg=body.weight_kg,
        length_cm=body.length_cm,
        width_cm=body.width_cm,
        height_cm=body.height_cm,
        billable_weight_kg=quote.billable_weight,
        is_pallet=body.is_pallet,
        base_cost=quote.base_cost,
        fuel_surcharge=quote.fuel_surcharge,
        price=quote.price,
        status="creata",
        email_status="none",
    )
    db.add(shipment)
    db.flush()

    db.add(
        TrackingEvent(
            shipment_id=shipment.id,
            status="creata",
            description="Spedizione creata",
            location=shipment.origin_city,
            timestamp=datetime.now(timezone.utc),
        )
    )

    if not as_admin:
        user.wallet_balance = round(user.wallet_balance - quote.price, 2)
        db.add(
            WalletTx(
                user_id=user.id,
                type="shipment",
                amount=-quote.price,
                ref=shipment.tracking_code,
                note=f"Spedizione {shipment.courier.upper()}",
                balance_after=user.wallet_balance,
            )
        )

    _touch_contact(db, user, body)

    shipment.email_status = send_shipment_email(shipment)
    db.commit()
    db.refresh(shipment)
    return shipment


def is_travelbox_shipment(shipment: Shipment) -> bool:
    return shipment.tracking_code.upper().startswith(TRAVELBOX_PREFIX)


_sync_lock = threading.Lock()
_last_sync = 0.0
SYNC_TTL = 120


def remove_travelbox_cart_item(reference: str) -> bool:
    from travelbox.api import get_client

    from .travelbox_quotes import client_lock

    with client_lock:
        return get_client().remove_from_cart(reference)


def sync_travelbox_shipments(db: Session, *, force: bool = False) -> dict:
    """Allinea le spedizioni TravelBox locali con lo stato del portale.

    - elimina le locali rimosse dal carrello (stato ANNULLATA)
    - aggiorna lo stato (pagata/trasmessa/consegnata...)
    - salva il token etichetta quando il portale lo espone
    """
    global _last_sync
    now = time.monotonic()
    with _sync_lock:
        if not force and now - _last_sync < SYNC_TTL:
            return {"skipped": True}

    local = list(db.scalars(select(Shipment).where(Shipment.tracking_code.like("TBC-%"))))
    if not local:
        _last_sync = now
        return {"local": 0, "deleted": 0, "updated": 0, "labels": 0}

    dates = [ensure_utc(shipment.created_at).date() for shipment in local]
    start = (min(dates) - timedelta(days=1)).isoformat()
    end = (date.today() + timedelta(days=1)).isoformat()

    from travelbox.api import get_client

    from .travelbox_quotes import client_lock

    remote_map = {}
    try:
        page = 1
        while page <= 20:
            before = len(remote_map)
            with client_lock:
                rows = get_client().shipments(page=page, data_dal=start, data_al=end)
            if not rows:
                break
            for row in rows:
                if row.reference:
                    remote_map[row.reference.strip().upper()] = row
            if len(remote_map) == before:
                break
            page += 1
    except Exception:
        logger.exception("TravelBox sync: elenco non disponibile")
        return {"error": True}

    deleted = 0
    updated = 0
    labels = 0
    for shipment in local:
        remote = remote_map.get(shipment.tracking_code.upper())
        if remote is None:
            continue
        status = (remote.status or "").upper()
        if "ANNULL" in status:
            db.delete(shipment)
            deleted += 1
            continue
        new_status = _travelbox_status(remote.status)
        if shipment.status != new_status:
            shipment.status = new_status
            updated += 1
        if remote.label_token and shipment.label_token != remote.label_token:
            shipment.label_token = remote.label_token
            labels += 1

    db.commit()
    _last_sync = time.monotonic()
    return {"local": len(local), "deleted": deleted, "updated": updated, "labels": labels}


def travelbox_label(db: Session, shipment: Shipment) -> tuple[bytes, str, str]:
    """Etichetta PDF reale da TravelBox, con token salvato o letto dal dettaglio."""
    from travelbox.api import get_client
    from travelbox.client import NotFound, UpstreamError

    from .travelbox_quotes import client_lock

    token = shipment.label_token
    if not token:
        try:
            with client_lock:
                detail = get_client().shipment_detail(shipment.tracking_code)
        except NotFound as exc:
            raise HTTPException(status_code=404, detail="Spedizione TravelBox non trovata") from exc
        except UpstreamError as exc:
            raise HTTPException(status_code=502, detail="Errore dal portale TravelBox") from exc
        token = detail.label_token
        if token:
            shipment.label_token = token
            db.commit()

    if not token:
        raise HTTPException(
            status_code=409,
            detail="Etichetta non ancora disponibile: completa il pagamento su TravelBox",
        )

    try:
        with client_lock:
            label = get_client().download_label(token)
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail="Impossibile scaricare l'etichetta da TravelBox") from exc

    return (
        label.content,
        label.content_type or "application/pdf",
        label.filename or f"etichetta-{shipment.tracking_code}.pdf",
    )


def _money_amount(money) -> float:
    if money is None:
        return 0.0
    try:
        return round(float(money.amount or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _travelbox_courier(value: str | None) -> str:
    text = (value or "").upper()
    if "POSTE" in text:
        return "poste"
    if "BRT" in text or "BARTOLINI" in text:
        return "brt"
    if "DHL" in text:
        return "dhl"
    if "FEDEX" in text:
        return "fedex"
    if "UPS" in text:
        return "ups"
    return "other"


SKIP_IMPORT_STATUSES = ("ANNULL", "RIFIUT", "IN ERRORE", "NON A BUON FINE")


def travelbox_status_importable(status: str | None) -> bool:
    text = (status or "").upper()
    return not any(marker in text for marker in SKIP_IMPORT_STATUSES)


def _travelbox_status(value: str | None) -> str:
    text = (value or "").upper()
    if "CONSEGNAT" in text:
        return "consegnata"
    if "IN CONSEGNA" in text:
        return "in_consegna"
    if any(marker in text for marker in ("GIACENZA", "DISPONIBILE PER IL RITIRO", "LASCIATO AVVISO")):
        return "giacenza"
    if any(
        marker in text
        for marker in ("IN TRANSITO", "TRASMESSA", "IN LAVORAZIONE", "IN FASE DI INVIO", "PARTITA")
    ):
        return "in_transito"
    return "creata"


def _parse_travelbox_date(value: str | None) -> datetime:
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M"):
        if not value:
            break
        try:
            return datetime.strptime(value.strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return datetime.now(timezone.utc)


def record_travelbox_history(
    db: Session,
    user: User,
    remote: TravelBoxShipment,
    detail: TravelBoxShipment | None = None,
) -> Shipment | None:
    """Importa una spedizione storica TravelBox nell'elenco MUVPACK.

    Il dettaglio (`/vedispedizione/{token}`) e' la fonte preferita per mittente,
    destinatario, colli e prezzi; se non e' disponibile si usa la riga di lista.
    """
    data = detail or remote
    reference = (data.reference or remote.reference or "").strip().upper()
    if not reference:
        reference = (data.tracking_number or remote.tracking_number or "").strip().upper()
    if not reference:
        return None
    if db.scalar(select(Shipment).where(Shipment.tracking_code == reference)) is not None:
        return None

    sender = data.sender or remote.sender
    recipient = data.recipient or remote.recipient
    packages = data.packages or []
    price = _money_amount(data.price) or _money_amount(remote.price)
    weight = data.chargeable_weight_kg or remote.chargeable_weight_kg or 0.0
    if not weight:
        weight = round(sum(package.weight_kg or 0 for package in packages), 2)
    first = packages[0] if packages else None
    service = (data.service or remote.service or "").lower()
    is_pallet = "pallet" in service or any(
        "pallet" in (package.type or "").lower() for package in packages
    )
    origin_city = (sender.city if sender else None) or (sender.name if sender else None) or "TravelBox"
    dest_city = (recipient.city if recipient else None) or (recipient.name if recipient else None) or "TravelBox"
    created_at = _parse_travelbox_date(data.created_at or remote.created_at)
    status_raw = remote.status or data.status
    status = _travelbox_status(status_raw)

    shipment = Shipment(
        tracking_code=reference,
        owner_id=user.id,
        is_admin_shipment=user.role == "admin",
        courier=_travelbox_courier(data.carrier or remote.carrier or service),
        origin_cap=(sender.postal_code if sender else None) or "00000",
        origin_city=origin_city,
        dest_cap=(recipient.postal_code if recipient else None) or "00000",
        dest_city=dest_city,
        recipient_name=(recipient.name if recipient else None) or "Destinatario TravelBox",
        recipient_address=(recipient.street if recipient else None) or "",
        recipient_email=recipient.email if recipient else None,
        weight_kg=weight,
        length_cm=(first.length_cm if first else None) or 0.0,
        width_cm=(first.width_cm if first else None) or 0.0,
        height_cm=(first.height_cm if first else None) or 0.0,
        billable_weight_kg=weight,
        is_pallet=is_pallet,
        base_cost=price,
        fuel_surcharge=0.0,
        price=price,
        status=status,
        email_status="none",
        created_at=created_at,
    )
    db.add(shipment)
    db.flush()
    db.add(
        TrackingEvent(
            shipment_id=shipment.id,
            status=status,
            description=f"Importata da TravelBox (stato: {status_raw or 'n/d'})",
            location=origin_city,
            timestamp=created_at,
        )
    )
    db.commit()
    db.refresh(shipment)
    return shipment


def record_travelbox_shipment(
    db: Session,
    user: User,
    body: TravelBoxCheckoutRequest,
    result: CreateShipmentResult,
) -> Shipment | None:
    """Registra nell'elenco MUVPACK una spedizione creata su TravelBox.

    Il codice di tracking locale coincide con il riferimento TravelBox
    (`TBC-...`), cosi' la spedizione compare subito in "Spedizioni effettuate"
    e nella pagina di tracking. Nessun movimento di portafoglio viene creato:
    il pagamento avviene sul portale TravelBox.
    """
    remote = result.shipment
    if remote is None or not remote.reference:
        return None

    reference = remote.reference.strip().upper()
    existing = db.scalar(select(Shipment).where(Shipment.tracking_code == reference))
    if existing is not None:
        return existing

    offer = result.offer
    price = _money_amount(offer.price if offer else None) or _money_amount(remote.price)
    net = _money_amount(offer.net_price if offer else None)
    tax = _money_amount(offer.tax if offer else None)
    base_cost = net if net > 0 else price
    billable = (
        float(offer.weight_kg)
        if offer is not None and offer.weight_kg
        else billable_weight(body)[0]
    )

    shipment = Shipment(
        tracking_code=reference,
        owner_id=user.id,
        is_admin_shipment=user.role == "admin",
        courier=_travelbox_courier((offer.carrier if offer else None) or remote.carrier),
        origin_cap=body.origin_cap,
        origin_city=body.origin_city or city_for_cap(body.origin_cap),
        dest_cap=body.dest_cap,
        dest_city=body.dest_city or city_for_cap(body.dest_cap),
        recipient_name=body.recipient_name.strip(),
        recipient_address=body.recipient_address.strip(),
        recipient_email=body.recipient_email,
        weight_kg=body.weight_kg,
        length_cm=body.length_cm,
        width_cm=body.width_cm,
        height_cm=body.height_cm,
        billable_weight_kg=billable,
        is_pallet=body.is_pallet,
        base_cost=base_cost,
        fuel_surcharge=tax,
        price=price,
        status="creata",
        email_status="none",
    )
    db.add(shipment)
    db.flush()
    db.add(
        TrackingEvent(
            shipment_id=shipment.id,
            status="creata",
            description=f"Spedizione creata su TravelBox ({reference})",
            location=shipment.origin_city,
            timestamp=datetime.now(timezone.utc),
        )
    )
    db.commit()
    db.refresh(shipment)
    return shipment


def advance_tracking(db: Session, shipment: Shipment) -> Shipment:
    # Le spedizioni TravelBox hanno il tracking reale sul portale: non va
    # simulato localmente.
    if is_travelbox_shipment(shipment):
        return shipment
    if shipment.status == "giacenza":
        return shipment
    created = ensure_utc(shipment.created_at)
    now = datetime.now(timezone.utc)
    elapsed = now - created
    existing = {event.description for event in shipment.events}
    changed = False
    current_status = shipment.status
    for offset, status, description, place in STAGES:
        if elapsed < offset or description in existing:
            continue
        location = {
            "origin": shipment.origin_city,
            "hub": f"Hub {shipment.origin_city}",
            "dest": shipment.dest_city,
        }[place]
        db.add(
            TrackingEvent(
                shipment_id=shipment.id,
                status=status,
                description=description,
                location=location,
                timestamp=created + offset,
            )
        )
        existing.add(description)
        current_status = status
        changed = True
    if changed:
        shipment.status = current_status
        db.commit()
        db.refresh(shipment)
    return shipment
