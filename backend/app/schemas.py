from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

CourierId = Literal["poste", "brt", "dhl"]
ShipmentStatus = Literal["creata", "in_transito", "in_consegna", "consegnata", "giacenza"]
MarkupType = Literal["percent", "fixed"]
Role = Literal["admin", "reseller"]
AccountStatus = Literal["active", "suspended"]
EmailStatus = Literal["none", "pending", "sent", "failed"]
TicketCategory = Literal["ritardo", "danno", "smarrito", "fatturazione", "account", "altro"]
TicketStatus = Literal["open", "answered", "closed"]

CAP_RE = re.compile(r"^\d{5}$")


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    company_name: str = Field(min_length=2)
    vat_number: str = Field(min_length=11, max_length=13)
    email: str
    password: str = Field(min_length=8)
    contact_name: str | None = None
    phone: str | None = None
    address: str | None = None
    accept_terms: Literal[True]


class UserPublic(BaseModel):
    id: str
    email: str
    role: Role
    company_name: str
    wallet_balance: float
    status: AccountStatus


class QuoteRequest(BaseModel):
    origin_cap: str
    dest_cap: str
    weight_kg: float = Field(gt=0)
    length_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    is_pallet: bool = False

    @field_validator("origin_cap", "dest_cap")
    @classmethod
    def _valid_cap(cls, v: str) -> str:
        v = (v or "").strip()
        if not CAP_RE.match(v):
            raise ValueError("CAP must be 5 digits")
        return v


class CourierQuote(BaseModel):
    courier: CourierId
    courier_name: str
    service_name: str
    delivery_time: str
    features: list[str]
    base_cost: float
    fuel_surcharge: float
    markup: float
    price: float


class QuoteResponse(BaseModel):
    is_pallet: bool
    pallet_zone: str | None
    billable_weight_kg: float
    volumetric_weight_kg: float
    origin_city: str
    dest_city: str
    quotes: list[CourierQuote]


class ShipmentCreate(QuoteRequest):
    courier: CourierId
    recipient_name: str = Field(min_length=2)
    recipient_address: str = Field(min_length=4)
    recipient_email: str | None = None

    @field_validator("recipient_email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if v and not re.match(r"^\S+@\S+\.\S+$", v):
            raise ValueError("invalid email")
        return v or None


class ResellerShipment(BaseModel):
    id: str
    tracking_code: str
    courier: CourierId
    origin_cap: str
    origin_city: str
    dest_cap: str
    dest_city: str
    recipient_name: str
    weight_kg: float
    price: float
    status: ShipmentStatus
    created_at: str
    email_status: EmailStatus
    is_pallet: bool


class TrackingEventOut(BaseModel):
    status: ShipmentStatus
    description: str
    location: str
    timestamp: str


class TrackingResponse(BaseModel):
    tracking_code: str
    courier: CourierId
    courier_name: str
    origin_city: str
    dest_city: str
    status: ShipmentStatus
    created_at: str
    events: list[TrackingEventOut]


class WalletTxOut(BaseModel):
    id: str
    type: Literal["shipment", "stripe_topup", "admin_adjust", "topup"]
    amount: float
    ref: str | None
    note: str | None
    created_at: str
    balance_after: float


class MonthStat(BaseModel):
    month: str
    shipments: int
    spent: float


class ResellerSummary(BaseModel):
    company_name: str
    wallet_balance: float
    shipments_this_month: int
    spent_this_month: float
    in_transit: int
    delivered: int
    monthly: list[MonthStat]


class AdminMonth(BaseModel):
    month: str
    revenue: float
    costs: float


class CourierSplit(BaseModel):
    courier: CourierId
    shipments: int
    revenue: float


class AdminKpis(BaseModel):
    total_revenue: float
    courier_costs: float
    net_profit: float
    net_margin_pct: float
    total_shipments: int
    active_clients: int
    monthly: list[AdminMonth]
    by_courier: list[CourierSplit]


class MarkupRule(BaseModel):
    courier: CourierId
    type: MarkupType
    value: float = Field(ge=0)


class MarkupRulesBody(BaseModel):
    rules: list[MarkupRule]


class ClientMarkup(BaseModel):
    standard: list[MarkupRule]
    overrides: list[MarkupRule]


class ClientMarkupBody(BaseModel):
    overrides: list[MarkupRule]


class PalletRate(BaseModel):
    courier: CourierId
    zone: Literal[1, 2, 3]
    price: float = Field(gt=0)


class PalletRatesBody(BaseModel):
    rates: list[PalletRate]


class PalletRatesResponse(BaseModel):
    zones: dict[str, str]
    rates: list[PalletRate]


class ClientRow(BaseModel):
    id: str
    email: str
    company_name: str
    vat_number: str
    wallet_balance: float
    status: AccountStatus
    shipments: int
    revenue: float
    created_at: str
    custom_markups: int
    contact_name: str | None
    phone: str | None
    address: str | None
    self_registered: bool


class ClientCreate(BaseModel):
    email: str
    company_name: str = Field(min_length=2)
    vat_number: str = Field(min_length=11, max_length=13)
    password: str = Field(min_length=8)
    initial_balance: float = Field(ge=0)


class ClientStatusBody(BaseModel):
    status: AccountStatus


class WalletAdjustBody(BaseModel):
    amount: float


class ContactInput(BaseModel):
    name: str = Field(min_length=2)
    address: str = Field(min_length=4)
    cap: str
    email: str | None = None

    @field_validator("cap")
    @classmethod
    def _valid_cap(cls, v: str) -> str:
        v = (v or "").strip()
        if not CAP_RE.match(v):
            raise ValueError("CAP must be 5 digits")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


class ContactOut(BaseModel):
    id: str
    name: str
    address: str
    cap: str
    city: str
    email: str | None
    uses: int
    last_used_at: str


class CheckoutRequest(BaseModel):
    package_id: Literal["50", "100", "250", "500"]
    origin_url: str


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class PaymentStatus(BaseModel):
    session_id: str
    status: str
    payment_status: str
    amount: float
    wallet_balance: float


class TicketCreate(BaseModel):
    subject: str = Field(min_length=4)
    category: TicketCategory
    tracking_code: str | None = None
    message: str = Field(min_length=10)


class TicketMessageOut(BaseModel):
    id: str
    author_role: Role
    author_name: str
    body: str
    created_at: str


class TicketSummary(BaseModel):
    id: str
    number: int
    client_id: str
    client_name: str
    subject: str
    category: TicketCategory
    tracking_code: str | None
    status: TicketStatus
    unread: bool
    messages_count: int
    last_message_preview: str
    created_at: str
    updated_at: str


class TicketDetail(TicketSummary):
    messages: list[TicketMessageOut]


class TicketReplyBody(BaseModel):
    body: str = Field(min_length=2)


class TicketStatusBody(BaseModel):
    status: TicketStatus
