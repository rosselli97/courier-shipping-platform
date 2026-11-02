"""Modelli canonici: la forma in cui il connettore espone i dati.

Sono volutamente tolleranti (quasi tutti i campi opzionali) perche' il portale
non e' documentato: un campo che oggi non c'e' non deve far fallire l'intera
risposta. Ogni modello conserva `raw` con i valori originali, cosi' il mapping
resta verificabile e correggibile senza perdere informazione.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class Party(BaseModel):
    name: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    kind: Optional[str] = None  # "Mittente" / "Destinatario"


class Money(BaseModel):
    amount: Optional[Decimal] = None
    currency: str = "EUR"
    formatted: Optional[str] = None


class Package(BaseModel):
    pieces: Optional[int] = None
    weight_kg: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    length_cm: Optional[float] = None
    type: Optional[str] = None


class Shipment(BaseModel):
    id: Optional[str] = None
    reference: Optional[str] = None
    tracking_number: Optional[str] = None
    tracking_url: Optional[str] = None
    status: Optional[str] = None
    carrier: Optional[str] = None
    service: Optional[str] = None
    sender: Optional[Party] = None
    recipient: Optional[Party] = None
    weight_kg: Optional[float] = None
    chargeable_weight_kg: Optional[float] = None
    pieces: Optional[int] = None
    packages: list[Package] = Field(default_factory=list)
    price: Optional[Money] = None
    created_at: Optional[str] = None
    payment_method: Optional[str] = None
    detail_url: Optional[str] = None
    label_url: Optional[str] = None
    label_token: Optional[str] = None
    pickup_date: Optional[str] = None
    notes: Optional[str] = None
    source: str = "travelboxcontorno"
    fetched_at: Optional[datetime] = None
    raw: dict[str, Any] = Field(default_factory=dict)


class ShipmentDraft(BaseModel):
    """Dati minimi per chiedere un preventivo e creare una spedizione.

    sender_id / recipient_id sono gli id della rubrica (`/address-book`).
    Le localita' sono ridondanti ma necessarie: il portale le mette nei cookie
    e non ricalcola l'indirizzo a partire dall'id.
    """

    sender_id: str
    recipient_id: str
    sender_name: Optional[str] = None
    sender_street: Optional[str] = None
    sender_email: Optional[str] = None
    sender_phone: Optional[str] = None
    sender_contact: Optional[str] = None
    sender_city: str
    sender_cap: str
    sender_province: str
    sender_country: str = "Italia"
    sender_country_code: str = "IT"
    # idcomune del portale: se assente viene risolto da CAP + citta'.
    sender_city_id: Optional[str] = None
    recipient_city: str
    recipient_cap: str
    recipient_province: str
    recipient_country: str = "Italia"
    recipient_country_code: str = "IT"
    recipient_city_id: Optional[str] = None
    # Dati destinatario usati per compilare il form di conferma quando il
    # destinatario non viene scelto dalla rubrica del portale.
    recipient_name: Optional[str] = None
    recipient_street: Optional[str] = None
    recipient_street2: Optional[str] = None
    recipient_email: Optional[str] = None
    recipient_phone: Optional[str] = None
    recipient_contact: Optional[str] = None
    recipient_tax_code: Optional[str] = None
    recipient_vat: Optional[str] = None
    packages: list[Package] = Field(min_length=1)
    service_type: Literal["nazionale", "importexport"] = "nazionale"
    notes: Optional[str] = None
    description: Optional[str] = None
    pickup_date: Optional[str] = None
    pickup_slot: Optional[str] = None
    declared_value: Optional[Decimal] = None
    cash_on_delivery: Optional[Decimal] = None
    insurance: bool = False

    @field_validator("sender_cap", "recipient_cap")
    @classmethod
    def _cap_must_look_valid(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("CAP obbligatorio")
        return value.strip()

    @field_validator("sender_city_id", "recipient_city_id")
    @classmethod
    def _city_id_is_numeric(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not value.isdigit():
            raise ValueError("l'id comune del portale e' numerico")
        return value

    @field_validator("packages")
    @classmethod
    def _packages_must_be_positive(cls, packages: list[Package]) -> list[Package]:
        for package in packages:
            if not package.pieces or package.pieces < 1:
                raise ValueError("ogni collo deve avere pieces >= 1")
            if package.weight_kg is None or package.weight_kg <= 0:
                raise ValueError("ogni collo deve avere un peso > 0")
        return packages


class Offer(BaseModel):
    id: Optional[str] = None
    carrier: Optional[str] = None
    service: Optional[str] = None
    # price e' il totale ivato mostrato nella colonna "Totale".
    price: Optional[Money] = None
    net_price: Optional[Money] = None
    tax: Optional[Money] = None
    currency: str = "EUR"
    weight_kg: Optional[float] = None
    list_id: Optional[str] = None
    detail_id: Optional[str] = None
    delivery_days: Optional[str] = None
    # book_url e' il link GET "Prenota": apre la preview del form di conferma.
    book_url: Optional[str] = None
    submit_url: Optional[str] = None
    submit_method: str = "GET"
    fields: dict[str, str] = Field(default_factory=dict)
    raw_text: Optional[str] = None


class QuoteResult(BaseModel):
    offers: list[Offer] = Field(default_factory=list)
    message: Optional[str] = None
    draft: ShipmentDraft
    fetched_at: datetime


class CreateShipmentResult(BaseModel):
    status: Literal["preview", "submitted"]
    message: str
    offer: Optional[Offer] = None
    shipment: Optional[Shipment] = None
    upstream_response: Optional[str] = None


class LabelFile(BaseModel):
    token: str
    url: str
    content_type: Optional[str] = None
    filename: Optional[str] = None
    size: Optional[int] = None
    content: bytes = Field(default_factory=bytes, repr=False)


class LabelGroup(BaseModel):
    id: str
    name: str


class Quote(BaseModel):
    id: Optional[str] = None
    created_at: Optional[str] = None
    carrier: Optional[str] = None
    parties: Optional[str] = None
    status: Optional[str] = None
    price: Optional[Money] = None
    detail_url: Optional[str] = None
    source: str = "travelboxcontorno"
    fetched_at: Optional[datetime] = None
    raw: dict[str, Any] = Field(default_factory=dict)


class RateList(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    type: Optional[str] = None
    owner: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    cloned_from: Optional[str] = None
    carrier: Optional[str] = None
    source: str = "travelboxcontorno"
    fetched_at: Optional[datetime] = None


class RateRow(BaseModel):
    """Fascia di prezzo di un listino (`/dettaglilistino`)."""

    shipment_type: Optional[str] = None
    tariff_type: Optional[str] = None
    weight_min: Optional[float] = None
    weight_max: Optional[float] = None
    volume_min: Optional[float] = None
    volume_max: Optional[float] = None
    price: Optional[Decimal] = None
    currency: str = "EUR"
    notes: Optional[str] = None
    fetched_at: Optional[datetime] = None


class Invoice(BaseModel):
    number: Optional[str] = None
    date: Optional[str] = None
    customer: Optional[str] = None
    amount: Optional[Money] = None
    pdf_url: Optional[str] = None
    source: str = "travelboxcontorno"
    fetched_at: Optional[datetime] = None
    raw: dict[str, Any] = Field(default_factory=dict)


class AddressBookEntry(BaseModel):
    id: Optional[str] = None
    # Id numerico usato dagli endpoint di scrittura (la rubrica espone token).
    numeric_id: Optional[str] = None
    party: Party
    kind: Optional[str] = None
    source: str = "travelboxcontorno"


class Health(BaseModel):
    ok: bool
    logged_in: bool
    base_url: str
    checked_at: datetime
    detail: Optional[str] = None
