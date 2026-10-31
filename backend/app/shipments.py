from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .geo import city_for_cap
from .models import Contact, Shipment, TrackingEvent, User, WalletTx
from .notify import send_shipment_email
from .pricing import COURIERS, quote_for_courier
from .schemas import ShipmentCreate

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
            city=city_for_cap(body.dest_cap),
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
        origin_city=city_for_cap(body.origin_cap),
        dest_cap=body.dest_cap,
        dest_city=city_for_cap(body.dest_cap),
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


def advance_tracking(db: Session, shipment: Shipment) -> Shipment:
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
