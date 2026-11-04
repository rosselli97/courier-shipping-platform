from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

CourierId = Literal["poste", "brt", "dhl", "fedex", "ups", "other"]
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
    origin_city: str | None = None
    dest_city: str | None = None
    weight_kg: float = Field(gt=0)
    length_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    pieces: int = Field(default=1, ge=1, le=100)
    is_pallet: bool = False
    source: Literal["auto", "local", "travelbox"] = "auto"

    @field_validator("origin_cap", "dest_cap")
    @classmethod
    def _valid_cap(cls, v: str) -> str:
        v = (v or "").strip()
        if not CAP_RE.match(v):
            raise ValueError("CAP must be 5 digits")
        return v


class ComuneOption(BaseModel):
    idcomune: str | None = None
    nome: str
    provincia: str | None = None


class CourierQuote(BaseModel):
    id: str | None = None
    courier: CourierId
    courier_name: str
    service_name: str
    delivery_time: str
    features: list[str]
    base_cost: float
    fuel_surcharge: float
    markup: float
    price: float
    source: Literal["local", "travelbox"] = "local"
    price_includes_vat: bool = False


class QuoteParty(BaseModel):
    name: str | None = None
    street: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    email: str | None = None
    phone: str | None = None
    contact: str | None = None


class QuoteResponse(BaseModel):
    is_pallet: bool
    pallet_zone: str | None
    billable_weight_kg: float
    volumetric_weight_kg: float
    origin_city: str
    dest_city: str
    quotes: list[CourierQuote]
    provider: Literal["local", "travelbox"] = "local"
    notice: str | None = None
    sender: QuoteParty | None = None


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
    source: Literal["local", "travelbox"] = "local"
    label_available: bool = True


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


class ResellerProfile(BaseModel):
    id: str
    email: str
    company_name: str
    vat_number: str
    contact_name: str | None
    phone: str | None
    address: str | None
    wallet_balance: float
    status: AccountStatus
    created_at: str
    shipments: int
    revenue: float


class AdminMonth(BaseModel):
    month: str
    revenue: float
    costs: float


class CourierSplit(BaseModel):
    courier: CourierId
    shipments: int
    revenue: float


class AdminScopeKpis(BaseModel):
    revenue: float
    costs: float
    profit: float
    margin_pct: float
    shipments: int
    monthly: list[AdminMonth]
    by_courier: list[CourierSplit]


class AdminKpis(BaseModel):
    active_clients: int
    admin: AdminScopeKpis
    clients: AdminScopeKpis


class AdminWallet(BaseModel):
    balance: float
    transactions: list[WalletTxOut]


class AdminWalletTopupBody(BaseModel):
    amount: float = Field(gt=0)
    note: str | None = None


class ShipmentSearchResult(BaseModel):
    source: Literal["muvpack", "travelbox"]
    reference: str | None = None
    tracking_code: str | None = None
    tracking_number: str | None = None
    status: str | None = None
    carrier: str | None = None
    sender_name: str | None = None
    recipient_name: str | None = None
    origin_city: str | None = None
    dest_city: str | None = None
    created_at: str | None = None
    price: float | None = None
    local_id: str | None = None
    local: bool = False
    portal_url: str | None = None


class ShipmentSearchResponse(BaseModel):
    results: list[ShipmentSearchResult]
    notice: str | None = None


class AdminChargeBody(BaseModel):
    code: str = Field(min_length=2)
    amount: float = Field(gt=0)
    note: str | None = None


class AdminChargeResponse(BaseModel):
    shipment_id: str
    tracking_code: str
    recipient_name: str
    owner_id: str
    owner_name: str
    owner_email: str
    owner_role: str
    amount: float
    previous_balance: float
    new_balance: float
    note: str | None = None


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


class RateMarkupRule(BaseModel):
    type: MarkupType
    value: float = Field(ge=0)


class RateListRowOut(BaseModel):
    shipment_type: str
    tariff_type: str
    weight_min: float
    weight_max: float
    volume_min: float
    volume_max: float
    price: float
    currency: str
    notes: str


class RateListOut(BaseModel):
    id: str
    name: str
    type: str
    carrier: str
    owner: str
    valid_from: str
    valid_to: str
    cloned_from: str
    active: bool
    imported_at: datetime
    row_count: int
    standard_markup: RateMarkupRule | None = None
    client_markup: RateMarkupRule | None = None


class RateListDetailOut(RateListOut):
    rows: list[RateListRowOut]


class RateListActiveBody(BaseModel):
    active: bool


class RateListMarkupItem(BaseModel):
    list_id: str
    type: MarkupType
    value: float = Field(ge=0)


class RateListMarkupsBody(BaseModel):
    client_id: str | None = None
    rules: list[RateListMarkupItem]


class RateListImportResult(BaseModel):
    lists: int
    rows: int
    failed: int
    imported_at: datetime


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
    city: str | None = None
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


class NotificationOut(BaseModel):
    id: str
    title: str
    body: str
    created_at: str
    read_at: str | None = None
    sender_name: str | None = None


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread: int


class AdminNotificationOut(NotificationOut):
    recipient_id: str
    recipient_name: str
    recipient_email: str
    recipient_role: Role


class NotificationSendBody(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    body: str = Field(min_length=1, max_length=2000)
    audience: Literal["all", "resellers", "selected"] = "all"
    recipient_ids: list[str] = Field(default_factory=list)

    @field_validator("title", "body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("must not be empty")
        return value


class NotificationSendResult(BaseModel):
    created: int


class TravelBoxCheckoutRequest(QuoteRequest):
    offer_id: str = Field(min_length=1)
    recipient_name: str = Field(min_length=2)
    recipient_address: str = Field(min_length=4)
    recipient_email: str | None = None
    recipient_phone: str | None = None
    recipient_contact: str | None = None
    sender_name: str | None = None
    sender_address: str | None = None
    sender_email: str | None = None
    sender_phone: str | None = None
    sender_contact: str | None = None
    description: str | None = None
    pickup_date: str | None = None
    pickup_slot: Literal["9-12", "12-15", "15-18", "18-21"] | None = None
    pickup_at_sender: bool = False
    apply_markup: bool | None = None
    markup_type: Literal["percent", "fixed"] | None = None
    markup_value: float | None = Field(default=None, ge=0)
    confirm: bool = True

    @field_validator("recipient_email")
    @classmethod
    def _checkout_email(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if v and not re.match(r"^\S+@\S+\.\S+$", v):
            raise ValueError("invalid email")
        return v or None


class TravelBoxCheckoutResponse(BaseModel):
    status: Literal["preview", "submitted"]
    message: str
    reference: str | None = None
    tracking_number: str | None = None
    shipment_id: str | None = None
    label_token: str | None = None
