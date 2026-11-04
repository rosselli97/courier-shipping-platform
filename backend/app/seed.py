from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import SessionLocal
from .geo import city_for_cap
from .models import (
    Contact,
    MarkupRule,
    Notification,
    PalletRate,
    Shipment,
    Ticket,
    TicketMessage,
    TrackingEvent,
    User,
    WalletTx,
)
from .pricing import COURIERS, DEFAULT_MARKUPS, DEFAULT_PALLET_RATES, quote_for_courier
from .schemas import QuoteRequest
from .security import hash_password

DEMO_PASSWORD = "Reseller123!"
ADMIN_PASSWORD = "Admin123!"


def _add_user(db: Session, email: str, password: str, role: str, company: str, vat: str, balance: float = 0.0, active: bool = True, self_registered: bool = True, **extra) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        role=role,
        company_name=company,
        vat_number=vat,
        wallet_balance=round(balance, 2),
        status="active" if active else "suspended",
        self_registered=self_registered,
        contact_name=extra.get("contact_name"),
        phone=extra.get("phone"),
        address=extra.get("address"),
    )
    db.add(user)
    db.flush()
    return user


def _shipment(db: Session, user: User, courier: str, code: str, origin: str, dest: str, weight: float, dims: tuple[float, float, float], recipient: str, address: str, created_at: datetime, status: str, is_admin: bool = False, recipient_email: str | None = None) -> Shipment:
    req = QuoteRequest(
        origin_cap=origin, dest_cap=dest, weight_kg=weight,
        length_cm=dims[0], width_cm=dims[1], height_cm=dims[2], is_pallet=weight > 100,
    )
    quote = quote_for_courier(db, req, courier, user)
    shipment = Shipment(
        tracking_code=code,
        owner_id=user.id,
        is_admin_shipment=is_admin,
        courier=courier,
        origin_cap=origin,
        origin_city=city_for_cap(origin),
        dest_cap=dest,
        dest_city=city_for_cap(dest),
        recipient_name=recipient,
        recipient_address=address,
        recipient_email=recipient_email,
        weight_kg=weight,
        length_cm=dims[0],
        width_cm=dims[1],
        height_cm=dims[2],
        billable_weight_kg=quote.billable_weight,
        is_pallet=req.is_pallet,
        base_cost=quote.base_cost,
        fuel_surcharge=quote.fuel_surcharge,
        price=quote.price,
        status=status,
        email_status="sent" if recipient_email else "none",
        created_at=created_at,
    )
    db.add(shipment)
    db.flush()
    db.add(
        TrackingEvent(
            shipment_id=shipment.id,
            status="creata",
            description="Spedizione creata",
            location=shipment.origin_city,
            timestamp=created_at,
        )
    )
    if status == "giacenza":
        db.add(
            TrackingEvent(
                shipment_id=shipment.id,
                status="giacenza",
                description="Tentativo di consegna non riuscito: pacco in giacenza",
                location=shipment.dest_city,
                timestamp=created_at + timedelta(hours=20),
            )
        )
    return shipment


def _ticket(db: Session, client: User, number: int, subject: str, category: str, body: str, status: str, created_at: datetime, reply: str | None = None, tracking: str | None = None) -> Ticket:
    ticket = Ticket(
        number=number,
        client_id=client.id,
        subject=subject,
        category=category,
        tracking_code=tracking,
        status=status,
        unread_for_admin=reply is None,
        unread_for_reseller=reply is not None,
        created_at=created_at,
        updated_at=created_at + timedelta(hours=2),
    )
    db.add(ticket)
    db.flush()
    db.add(
        TicketMessage(
            ticket_id=ticket.id,
            author_role="reseller",
            author_name=client.company_name,
            body=body,
            created_at=created_at,
        )
    )
    if reply:
        db.add(
            TicketMessage(
                ticket_id=ticket.id,
                author_role="admin",
                author_name="Supporto MUVPACK",
                body=reply,
                created_at=created_at + timedelta(hours=2),
            )
        )
    return ticket


def seed() -> None:
    db = SessionLocal()
    try:
        if db.scalar(select(func.count(User.id))):
            return
        now = datetime.now(timezone.utc)

        for courier, (kind, value) in DEFAULT_MARKUPS.items():
            db.add(MarkupRule(client_id=None, courier=courier, type=kind, value=value))
        for (courier, zone), price in DEFAULT_PALLET_RATES.items():
            db.add(PalletRate(courier=courier, zone=zone, price=price))

        admin = _add_user(db, "admin@muvpack.it", ADMIN_PASSWORD, "admin", "MUVPACK", "IT00000000000", 0.0)
        reseller = _add_user(
            db, "reseller@muvpack.it", DEMO_PASSWORD, "reseller", "Rossi Logistica Srl", "IT01234567890", 0.0,
            contact_name="Mario Rossi", phone="+39 02 1234567", address="Via Roma 1, 20121 Milano",
        )
        bianchi = _add_user(db, "bianchi@muvpack.it", DEMO_PASSWORD, "reseller", "Bianchi Commerce Srl", "IT09876543210", 0.0)
        verdi = _add_user(db, "verdi@muvpack.it", DEMO_PASSWORD, "reseller", "Verdi Express Srl", "IT11223344556", 0.0, active=False)

        starting_balance = 500.0
        db.add(
            WalletTx(
                user_id=reseller.id,
                type="stripe_topup",
                amount=starting_balance,
                ref="seed_topup_0001",
                note="Ricarica iniziale",
                balance_after=starting_balance,
                created_at=now - timedelta(days=120),
            )
        )
        db.add(
            WalletTx(
                user_id=bianchi.id,
                type="admin_adjust",
                amount=300.0,
                ref=None,
                note="Credito iniziale",
                balance_after=300.0,
                created_at=now - timedelta(days=60),
            )
        )
        db.add(
            WalletTx(
                user_id=verdi.id,
                type="admin_adjust",
                amount=150.0,
                ref=None,
                note="Credito iniziale",
                balance_after=150.0,
                created_at=now - timedelta(days=45),
            )
        )

        contacts = [
            ("Studio Legale Bianchi", "Via Montenapoleone 8", "20121", "Milano", "studio@bianchi.it", 12, now - timedelta(days=3)),
            ("Farmacia Centrale", "Corso Vittorio Emanuele 21", "00187", "Roma", None, 8, now - timedelta(days=10)),
            ("Boutique Aurora", "Via Po 14", "10121", "Torino", "aurora@boutique.it", 5, now - timedelta(days=21)),
            ("Emporio Verdi", "Via Toledo 45", "80134", "Napoli", None, 2, now - timedelta(days=35)),
        ]
        for name, address, cap, city, email, uses, last in contacts:
            db.add(
                Contact(
                    user_id=reseller.id, name=name, address=address, cap=cap, city=city,
                    email=email, uses=uses, last_used_at=last, created_at=now - timedelta(days=90),
                )
            )

        balance = starting_balance
        reseller_shipments = [
            ("poste", "MVP20260001", "20121", "00187", 3.0, (40, 30, 20), "Studio Legale Bianchi", "Via Montenapoleone 8", now - timedelta(days=10), "consegnata"),
            ("brt", "MVP20260002", "20121", "40121", 5.0, (50, 40, 30), "Boutique Aurora", "Via Po 14", now - timedelta(days=60), "consegnata"),
            ("dhl", "MVP20260003", "20121", "10121", 1.0, (30, 22, 3), "Farmacia Centrale", "Corso Vittorio Emanuele 21", now - timedelta(days=30), "consegnata"),
            ("brt", "MVP20260004", "20121", "80134", 150.0, (120, 80, 100), "Emporio Verdi", "Via Toledo 45", now - timedelta(hours=5), "in_transito"),
            ("poste", "MVP20260005", "20121", "50123", 2.0, (35, 25, 15), "Libreria Dante", "Via de' Cerchi 12", now - timedelta(days=20), "giacenza"),
            ("dhl", "MVP20260006", "20121", "16121", 8.0, (60, 40, 40), "TechPoint Srl", "Via XX Settembre 33", now - timedelta(hours=30), "consegnata"),
        ]
        for courier, code, origin, dest, weight, dims, name, address, created, status in reversed(reseller_shipments):
            shipment = _shipment(
                db, reseller, courier, code, origin, dest, weight, dims, name, address, created, status,
                recipient_email="cliente@example.it",
            )
            balance = round(balance - shipment.price, 2)
            db.add(
                WalletTx(
                    user_id=reseller.id,
                    type="shipment",
                    amount=-shipment.price,
                    ref=shipment.tracking_code,
                    note=f"Spedizione {COURIERS[courier]['name']}",
                    balance_after=balance,
                    created_at=created,
                )
            )
        reseller.wallet_balance = balance

        bianchi_balance = 300.0
        for code, courier, origin, dest, weight, dims, name, address, created, status in [
            ("MVP20260007", "brt", "20121", "37121", 4.0, (40, 30, 25), "Cantina Verona", "Via Mazzini 5", now - timedelta(days=24), "consegnata"),
            ("MVP20260008", "poste", "20121", "70121", 2.5, (35, 30, 20), "Bari Store", "Via Sparano 100", now - timedelta(days=8), "consegnata"),
            ("MVP20260009", "dhl", "20121", "90133", 6.0, (50, 40, 35), "Palermo Shipping", "Via Roma 300", now - timedelta(hours=18), "in_transito"),
        ]:
            shipment = _shipment(db, bianchi, courier, code, origin, dest, weight, dims, name, address, created, status)
            bianchi_balance = round(bianchi_balance - shipment.price, 2)
            db.add(
                WalletTx(
                    user_id=bianchi.id,
                    type="shipment",
                    amount=-shipment.price,
                    ref=shipment.tracking_code,
                    note=f"Spedizione {COURIERS[courier]['name']}",
                    balance_after=bianchi_balance,
                    created_at=created,
                )
            )
        bianchi.wallet_balance = bianchi_balance

        _shipment(db, admin, "dhl", "MVP20260010", "20121", "00187", 2.0, (30, 25, 15), "MUVPACK Roma", "Via del Corso 10", now - timedelta(days=5), "consegnata", is_admin=True)
        _shipment(db, admin, "brt", "MVP20260011", "20121", "40121", 12.0, (60, 50, 40), "MUVPACK Bologna", "Via Indipendenza 8", now - timedelta(days=2), "consegnata", is_admin=True)

        _ticket(
            db, reseller, 1, "Ritardo consegna spedizione MVP20260004", "ritardo",
            "Buongiorno, la spedizione risulta ferma da due giorni. Potete verificare?",
            "open", now - timedelta(days=1), tracking="MVP20260004",
        )
        _ticket(
            db, reseller, 2, "Richiesta fattura ricarica ottobre", "fatturazione",
            "Avrei bisogno della fattura relativa alla ricarica del portafoglio di ottobre.",
            "answered", now - timedelta(days=4),
            reply="Ciao, trovi la fattura nella sezione Movimenti del portafoglio. L'abbiamo inviata anche via email.",
        )

        db.add(
            Notification(
                user_id=reseller.id,
                title="Benvenuto su MUVPACK",
                body="Da qui ricevi aggiornamenti su spedizioni, saldo e comunicazioni del team.",
                created_by=admin.id,
                created_at=now - timedelta(hours=6),
            )
        )
        db.add(
            Notification(
                user_id=bianchi.id,
                title="Nuove tariffe disponibili",
                body="Abbiamo aggiornato i listini corriere: controlla i prezzi nella nuova spedizione.",
                created_by=admin.id,
                read_at=now - timedelta(hours=2),
                created_at=now - timedelta(days=1),
            )
        )

        db.commit()
    finally:
        db.close()
