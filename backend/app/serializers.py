from __future__ import annotations

from datetime import datetime, timezone

from .models import Contact, Shipment, Ticket, User, WalletTx
from .schemas import (
    ClientRow,
    ContactOut,
    ResellerShipment,
    TicketDetail,
    TicketMessageOut,
    TicketSummary,
    UserPublic,
    WalletTxOut,
)


def iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def user_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        email=user.email,
        role=user.role,  # type: ignore[arg-type]
        company_name=user.company_name,
        wallet_balance=round(user.wallet_balance, 2),
        status=user.status,  # type: ignore[arg-type]
    )


def shipment_out(shipment: Shipment) -> ResellerShipment:
    return ResellerShipment(
        id=shipment.id,
        tracking_code=shipment.tracking_code,
        courier=shipment.courier,  # type: ignore[arg-type]
        origin_cap=shipment.origin_cap,
        origin_city=shipment.origin_city,
        dest_cap=shipment.dest_cap,
        dest_city=shipment.dest_city,
        recipient_name=shipment.recipient_name,
        weight_kg=shipment.weight_kg,
        price=round(shipment.price, 2),
        status=shipment.status,  # type: ignore[arg-type]
        created_at=iso(shipment.created_at),
        email_status=shipment.email_status,  # type: ignore[arg-type]
        is_pallet=shipment.is_pallet,
    )


def wallet_tx_out(tx: WalletTx) -> WalletTxOut:
    return WalletTxOut(
        id=tx.id,
        type=tx.type,  # type: ignore[arg-type]
        amount=round(tx.amount, 2),
        ref=tx.ref,
        note=tx.note,
        created_at=iso(tx.created_at),
        balance_after=round(tx.balance_after, 2),
    )


def contact_out(contact: Contact) -> ContactOut:
    return ContactOut(
        id=contact.id,
        name=contact.name,
        address=contact.address,
        cap=contact.cap,
        city=contact.city,
        email=contact.email,
        uses=contact.uses,
        last_used_at=iso(contact.last_used_at),
    )


def client_row(user: User, shipments: int, revenue: float, custom_markups: int) -> ClientRow:
    return ClientRow(
        id=user.id,
        email=user.email,
        company_name=user.company_name,
        vat_number=user.vat_number,
        wallet_balance=round(user.wallet_balance, 2),
        status=user.status,  # type: ignore[arg-type]
        shipments=shipments,
        revenue=round(revenue, 2),
        created_at=iso(user.created_at),
        custom_markups=custom_markups,
        contact_name=user.contact_name,
        phone=user.phone,
        address=user.address,
        self_registered=user.self_registered,
    )


def _last_preview(ticket: Ticket) -> str:
    if not ticket.messages:
        return ""
    body = ticket.messages[-1].body.replace("\n", " ").strip()
    return body[:90]


def ticket_summary(ticket: Ticket, role: str) -> TicketSummary:
    unread = ticket.unread_for_admin if role == "admin" else ticket.unread_for_reseller
    return TicketSummary(
        id=ticket.id,
        number=ticket.number,
        client_id=ticket.client_id,
        client_name=ticket.client.company_name,
        subject=ticket.subject,
        category=ticket.category,  # type: ignore[arg-type]
        tracking_code=ticket.tracking_code,
        status=ticket.status,  # type: ignore[arg-type]
        unread=unread,
        messages_count=len(ticket.messages),
        last_message_preview=_last_preview(ticket),
        created_at=iso(ticket.created_at),
        updated_at=iso(ticket.updated_at),
    )


def ticket_detail(ticket: Ticket, role: str) -> TicketDetail:
    base = ticket_summary(ticket, role)
    return TicketDetail(
        **base.model_dump(),
        messages=[
            TicketMessageOut(
                id=message.id,
                author_role=message.author_role,  # type: ignore[arg-type]
                author_name=message.author_name,
                body=message.body,
                created_at=iso(message.created_at),
            )
            for message in ticket.messages
        ],
    )
