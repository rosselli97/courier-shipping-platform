from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="reseller")
    company_name: Mapped[str] = mapped_column(String(255))
    vat_number: Mapped[str] = mapped_column(String(32), default="")
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    wallet_balance: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(16), default="active")
    self_registered: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    shipments: Mapped[list[Shipment]] = relationship(back_populates="owner")
    contacts: Mapped[list[Contact]] = relationship(back_populates="owner")
    transactions: Mapped[list[WalletTx]] = relationship(back_populates="owner")


class MarkupRule(Base):
    __tablename__ = "markup_rules"
    __table_args__ = (UniqueConstraint("client_id", "courier", name="uq_markup_client_courier"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    courier: Mapped[str] = mapped_column(String(16))
    type: Mapped[str] = mapped_column(String(16), default="percent")
    value: Mapped[float] = mapped_column(Float, default=0.0)


class PalletRate(Base):
    __tablename__ = "pallet_rates"
    __table_args__ = (UniqueConstraint("courier", "zone", name="uq_pallet_courier_zone"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    courier: Mapped[str] = mapped_column(String(16))
    zone: Mapped[int] = mapped_column(Integer)
    price: Mapped[float] = mapped_column(Float)


class Shipment(Base):
    __tablename__ = "shipments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    tracking_code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    is_admin_shipment: Mapped[bool] = mapped_column(Boolean, default=False)
    courier: Mapped[str] = mapped_column(String(16))
    origin_cap: Mapped[str] = mapped_column(String(5))
    origin_city: Mapped[str] = mapped_column(String(64))
    dest_cap: Mapped[str] = mapped_column(String(5))
    dest_city: Mapped[str] = mapped_column(String(64))
    recipient_name: Mapped[str] = mapped_column(String(255))
    recipient_address: Mapped[str] = mapped_column(String(255))
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    weight_kg: Mapped[float] = mapped_column(Float)
    length_cm: Mapped[float] = mapped_column(Float)
    width_cm: Mapped[float] = mapped_column(Float)
    height_cm: Mapped[float] = mapped_column(Float)
    billable_weight_kg: Mapped[float] = mapped_column(Float)
    is_pallet: Mapped[bool] = mapped_column(Boolean, default=False)
    base_cost: Mapped[float] = mapped_column(Float)
    fuel_surcharge: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16), default="creata")
    email_status: Mapped[str] = mapped_column(String(16), default="none")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="shipments")
    events: Mapped[list[TrackingEvent]] = relationship(
        back_populates="shipment", cascade="all, delete-orphan", order_by="TrackingEvent.timestamp"
    )


class TrackingEvent(Base):
    __tablename__ = "tracking_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    shipment_id: Mapped[str] = mapped_column(ForeignKey("shipments.id"), index=True)
    status: Mapped[str] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(String(255))
    location: Mapped[str] = mapped_column(String(128))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    shipment: Mapped[Shipment] = relationship(back_populates="events")


class WalletTx(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(24))
    amount: Mapped[float] = mapped_column(Float)
    ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    balance_after: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="transactions")


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str] = mapped_column(String(255))
    cap: Mapped[str] = mapped_column(String(5))
    city: Mapped[str] = mapped_column(String(64))
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uses: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    owner: Mapped[User] = relationship(back_populates="contacts")


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    number: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    subject: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(24))
    tracking_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="open")
    unread_for_reseller: Mapped[bool] = mapped_column(Boolean, default=False)
    unread_for_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    client: Mapped[User] = relationship()
    messages: Mapped[list[TicketMessage]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan", order_by="TicketMessage.created_at"
    )


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id"), index=True)
    author_role: Mapped[str] = mapped_column(String(16))
    author_name: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ticket: Mapped[Ticket] = relationship(back_populates="messages")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(24), default="open")
    payment_status: Mapped[str] = mapped_column(String(24), default="unpaid")
    credited: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
