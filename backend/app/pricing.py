from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from .geo import PALLET_ZONES, city_for_cap, pallet_zone
from .models import MarkupRule, PalletRate, RateListMarkup, User
from .schemas import CourierId, CourierQuote, QuoteRequest, QuoteResponse

COURIERS: dict[str, dict] = {
    "poste": {
        "name": "Poste Italiane",
        "service": "Poste Delivery Business",
        "delivery": "2-3 giorni lavorativi",
        "features": ["Tracking incluso", "Consegna a domicilio", "Assicurazione base"],
        "base": 4.90,
        "per_kg": 0.85,
        "fuel_pct": 0.08,
    },
    "brt": {
        "name": "BRT",
        "service": "BRT Express",
        "delivery": "24-48 ore",
        "features": ["Tracking incluso", "Consegna 24-48h", "Ritiro gratuito"],
        "base": 5.50,
        "per_kg": 1.05,
        "fuel_pct": 0.11,
    },
    "dhl": {
        "name": "DHL Express",
        "service": "DHL Express Domestic",
        "delivery": "24 ore",
        "features": ["Tracking incluso", "Consegna entro 24h", "Assistenza prioritaria"],
        "base": 7.90,
        "per_kg": 1.35,
        "fuel_pct": 0.14,
    },
}

DEFAULT_MARKUPS: dict[str, tuple[str, float]] = {
    "poste": ("percent", 12.0),
    "brt": ("percent", 10.0),
    "dhl": ("percent", 8.0),
}

DEFAULT_PALLET_RATES: dict[tuple[str, int], float] = {
    ("poste", 1): 39.90, ("poste", 2): 49.90, ("poste", 3): 59.90,
    ("brt", 1): 34.90, ("brt", 2): 44.90, ("brt", 3): 54.90,
    ("dhl", 1): 44.90, ("dhl", 2): 54.90, ("dhl", 3): 64.90,
}

VOLUMETRIC_DIVISOR = 5000.0


def round2(value: float) -> float:
    return round(float(value) + 1e-9, 2)


def billable_weight(req: QuoteRequest) -> tuple[float, float]:
    pieces = max(1, int(req.pieces or 1))
    volumetric = (req.length_cm * req.width_cm * req.height_cm * pieces) / VOLUMETRIC_DIVISOR
    return round2(max(req.weight_kg, volumetric)), round2(volumetric)


def standard_rules(db: Session) -> dict[str, tuple[str, float]]:
    rules = {c: DEFAULT_MARKUPS[c] for c in COURIERS}
    for row in db.scalars(select(MarkupRule).where(MarkupRule.client_id.is_(None))):
        rules[row.courier] = (row.type, row.value)
    return rules


def client_overrides(db: Session, client_id: str) -> dict[str, tuple[str, float]]:
    return {
        row.courier: (row.type, row.value)
        for row in db.scalars(select(MarkupRule).where(MarkupRule.client_id == client_id))
    }


def effective_markups(db: Session, user: User | None) -> dict[str, tuple[str, float]]:
    rules = standard_rules(db)
    if user is not None:
        rules.update(client_overrides(db, user.id))
    return rules


def rate_list_markups(db: Session, client_id: str | None) -> dict[str, tuple[str, float]]:
    condition = RateListMarkup.client_id.is_(None) if client_id is None else RateListMarkup.client_id == client_id
    return {
        row.list_id: (row.type, row.value)
        for row in db.scalars(select(RateListMarkup).where(condition))
    }


def standard_rate_list_markups(db: Session) -> dict[str, tuple[str, float]]:
    return rate_list_markups(db, None)


def effective_rate_markup(
    db: Session,
    user: User | None,
    list_id: str | None,
    courier: str,
) -> tuple[str, float]:
    """Ricarico effettivo di un listino per un cliente.

    Ordine: override del cliente sul listino -> ricarico standard del listino
    -> nessun ricarico.
    """
    if list_id:
        if user is not None:
            row = db.scalar(
                select(RateListMarkup).where(
                    RateListMarkup.client_id == user.id,
                    RateListMarkup.list_id == list_id,
                )
            )
            if row is not None:
                return (row.type, row.value)
        row = db.scalar(
            select(RateListMarkup).where(
                RateListMarkup.client_id.is_(None),
                RateListMarkup.list_id == list_id,
            )
        )
        if row is not None:
            return (row.type, row.value)
    return ("percent", 0.0)


def pallet_price(db: Session, courier: str, zone: int) -> float:
    row = db.scalar(select(PalletRate).where(PalletRate.courier == courier, PalletRate.zone == zone))
    if row is not None:
        return row.price
    return DEFAULT_PALLET_RATES[(courier, zone)]


def _markup_amount(kind: str, value: float, taxable: float) -> float:
    if kind == "fixed":
        return round2(value)
    return round2(taxable * value / 100.0)


@dataclass
class CostedQuote:
    courier: str
    base_cost: float
    fuel_surcharge: float
    markup: float
    price: float
    billable_weight: float
    volumetric_weight: float
    zone: int | None


def quote_for_courier(db: Session, req: QuoteRequest, courier: str, user: User | None) -> CostedQuote:
    config = COURIERS[courier]
    billable, volumetric = billable_weight(req)
    zone = pallet_zone(req.origin_cap, req.dest_cap) if req.is_pallet else None

    if req.is_pallet:
        pieces = max(1, int(req.pieces or 1))
        base = round2(pallet_price(db, courier, zone or 1) * pieces)
    else:
        base = round2(config["base"] + config["per_kg"] * billable)

    fuel = round2(base * config["fuel_pct"])
    rule_type, rule_value = effective_markups(db, user)[courier]
    markup = _markup_amount(rule_type, rule_value, base + fuel)
    price = round2(base + fuel + markup)

    return CostedQuote(
        courier=courier,
        base_cost=base,
        fuel_surcharge=fuel,
        markup=markup,
        price=price,
        billable_weight=billable,
        volumetric_weight=volumetric,
        zone=zone,
    )


def build_quote(db: Session, req: QuoteRequest, user: User | None) -> QuoteResponse:
    quotes: list[CourierQuote] = []
    zone: int | None = 1 if req.is_pallet else None
    first = quote_for_courier(db, req, "poste", user)
    for courier in COURIERS:
        costed = first if courier == "poste" else quote_for_courier(db, req, courier, user)
        config = COURIERS[courier]
        if req.is_pallet:
            zone = costed.zone
        quotes.append(
            CourierQuote(
                courier=courier,  # type: ignore[arg-type]
                courier_name=config["name"],
                service_name=config["service"],
                delivery_time=config["delivery"],
                features=list(config["features"]),
                base_cost=costed.base_cost,
                fuel_surcharge=costed.fuel_surcharge,
                markup=costed.markup,
                price=costed.price,
            )
        )
    return QuoteResponse(
        is_pallet=req.is_pallet,
        pallet_zone=PALLET_ZONES[zone] if zone else None,
        billable_weight_kg=first.billable_weight,
        volumetric_weight_kg=first.volumetric_weight,
        origin_city=req.origin_city or city_for_cap(req.origin_cap),
        dest_city=req.dest_city or city_for_cap(req.dest_cap),
        quotes=quotes,
    )


def zones_payload() -> dict[str, str]:
    return {str(z): label for z, label in PALLET_ZONES.items()}
