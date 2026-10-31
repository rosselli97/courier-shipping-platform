from __future__ import annotations

import logging
import threading
import time

from travelbox import parsers
from travelbox.api import get_client
from travelbox.config import Settings

from .config import (
    TRAVELBOX_QUOTE_CACHE_TTL,
    TRAVELBOX_QUOTES_ENABLED,
    TRAVELBOX_QUOTES_PUBLIC,
    TRAVELBOX_SENDER_CAP,
    TRAVELBOX_SENDER_CITY,
    TRAVELBOX_SENDER_ID,
    TRAVELBOX_SENDER_PROVINCE,
)
from .geo import PALLET_ZONES, city_for_cap, pallet_zone
from .models import User
from .pricing import billable_weight
from .schemas import CourierQuote, QuoteParty, QuoteRequest, QuoteResponse

logger = logging.getLogger("muvpack.travelbox")
_settings = Settings()

FRIENDLY = {
    "poste": "Poste Italiane",
    "brt": "BRT",
    "dhl": "DHL Express",
    "fedex": "FedEx",
    "ups": "UPS",
    "other": "Corriere",
}

_cache: dict[tuple, tuple[float, QuoteResponse]] = {}
_cache_lock = threading.Lock()
_client_lock = threading.Lock()

_sender_cache: tuple[float, dict[str, str] | None] = (0.0, None)
_sender_lock = threading.Lock()


def _amount(money) -> float:
    if money is None:
        return 0.0
    try:
        return float(money.amount or 0)
    except (TypeError, ValueError):
        return 0.0


def _carrier_id(carrier: str | None) -> str:
    value = (carrier or "").upper()
    if "POSTE" in value:
        return "poste"
    if "BRT" in value or "BARTOLINI" in value:
        return "brt"
    if "DHL" in value:
        return "dhl"
    if "FEDEX" in value:
        return "fedex"
    if "UPS" in value:
        return "ups"
    return "other"


def _configured_sender() -> dict[str, str] | None:
    if TRAVELBOX_SENDER_ID and TRAVELBOX_SENDER_CITY and TRAVELBOX_SENDER_CAP:
        return {
            "id": TRAVELBOX_SENDER_ID,
            "city": TRAVELBOX_SENDER_CITY,
            "cap": TRAVELBOX_SENDER_CAP,
            "province": TRAVELBOX_SENDER_PROVINCE,
            "name": "",
            "street": "",
            "email": "",
            "phone": "",
        }
    return None


def _sender_detail(entry_id: str) -> dict:
    try:
        with _client_lock:
            response = get_client()._request("GET", f"/getmittentidestinatarimod/{entry_id}")
        if response.status_code < 400:
            return response.json().get("data") or {}
    except Exception:
        logger.exception("TravelBox: impossibile leggere il dettaglio del mittente")
    return {}


def _enrich_sender(data: dict[str, str], entry) -> dict[str, str]:
    detail = _sender_detail(entry.id)
    if detail:
        data = _detail_sender(data, detail)
        data["token"] = entry.id
    return data


def _detail_sender(data: dict[str, str], detail: dict) -> dict[str, str]:
    """Completa il mittente configurato leggendo `/getmittentidestinatarimod`."""
    if not detail:
        return data
    data["id"] = str(detail.get("id") or data.get("id") or "")
    data["name"] = str(detail.get("cognomenome") or data.get("name") or "")
    data["street"] = str(detail.get("indirizzo1") or data.get("street") or "")
    data["city"] = str(detail.get("citta") or data.get("city") or "")
    data["cap"] = str(detail.get("cap") or data.get("cap") or "")
    data["province"] = str(detail.get("provincia") or data.get("province") or "")
    data["email"] = str(detail.get("email") or data.get("email") or "")
    data["phone"] = str(detail.get("telefono") or data.get("phone") or "")
    data["mobile"] = str(detail.get("cellulare") or data.get("mobile") or "")
    data["contact"] = str(detail.get("contatto") or data.get("contact") or "")
    data["anagrafica_id"] = str(detail.get("anagrafica_id") or data.get("anagrafica_id") or "")
    return data


def _resolve_sender() -> dict[str, str] | None:
    global _sender_cache
    configured = _configured_sender()

    now = time.monotonic()
    with _sender_lock:
        if _sender_cache[1] is not None and now - _sender_cache[0] < 3600:
            return _sender_cache[1]

    try:
        with _client_lock:
            entries = get_client().address_book()
    except Exception:
        logger.exception("TravelBox: impossibile leggere la rubrica per il mittente")
        return configured

    profile: dict[str, str] = {}
    try:
        with _client_lock:
            profile = get_client().account_anagrafica()
    except Exception:
        logger.exception("TravelBox: impossibile leggere l'anagrafica dell'account")
    profile_email = (profile.get("email") or "").strip().casefold()
    profile_name = (profile.get("ragione_sociale") or "").strip().casefold()

    fallback = None
    first_mittente = None
    valid_mittente = None
    first_valid = None
    hint_mittente = None
    hint_any = None
    for entry in entries:
        party = entry.party
        if not entry.id or not party.city or not party.postal_code or not party.province:
            continue
        entry_id = entry.numeric_id or parsers.numeric_id(entry.id) or entry.id
        data = {
            "id": entry_id,
            "token": entry.id,
            "city": party.city,
            "cap": party.postal_code,
            "province": party.province,
            "name": party.name or "",
            "street": party.street or "",
            "email": party.email or "",
            "phone": party.phone or "",
            "mobile": "",
            "contact": "",
            "anagrafica_id": "",
        }
        if fallback is None:
            fallback = (data, entry)
        if configured and configured["id"] in (entry_id, entry.id):
            data = _enrich_sender(data, entry)
            with _sender_lock:
                _sender_cache = (now, data)
            return data
        is_mittente = "mitt" in (entry.kind or "").lower() or not entry.kind
        has_data = bool(data["name"].strip() and data["street"].strip())
        if has_data and first_valid is None:
            first_valid = (data, entry)
        if is_mittente and first_mittente is None:
            first_mittente = (data, entry)
        if is_mittente and has_data and valid_mittente is None:
            valid_mittente = (data, entry)
        hint = has_data and (
            (profile_email and (data["email"] or "").strip().casefold() == profile_email)
            or (profile_name and (data["name"] or "").strip().casefold() == profile_name)
        )
        if hint:
            if hint_any is None:
                hint_any = (data, entry)
            if is_mittente and hint_mittente is None:
                hint_mittente = (data, entry)

    if configured:
        # Id configurato ma non presente (o non confrontabile) in rubrica:
        # leggiamo comunque il dettaglio per avere nome, indirizzo e
        # anagrafica_id necessari alla creazione.
        data = _detail_sender(dict(configured), _sender_detail(configured["id"]))
        with _sender_lock:
            _sender_cache = (now, data)
        return data

    candidate = (
        hint_mittente
        or hint_any
        or valid_mittente
        or first_valid
        or first_mittente
        or fallback
    )
    if candidate is not None:
        data, entry = candidate
        data = _enrich_sender(data, entry)
        with _sender_lock:
            _sender_cache = (now, data)
        return data
    return None


def _cache_get(key: tuple) -> QuoteResponse | None:
    now = time.monotonic()
    with _cache_lock:
        entry = _cache.get(key)
        if entry and now < entry[0]:
            return entry[1]
    return None


def _cache_set(key: tuple, value: QuoteResponse) -> None:
    if TRAVELBOX_QUOTE_CACHE_TTL <= 0:
        return
    with _cache_lock:
        _cache[key] = (time.monotonic() + TRAVELBOX_QUOTE_CACHE_TTL, value)


def _build_draft(
    req: QuoteRequest,
    sender: dict[str, str],
    *,
    sender_name: str | None = None,
    sender_street: str | None = None,
    sender_email: str | None = None,
    sender_phone: str | None = None,
    sender_contact: str | None = None,
    recipient_name: str | None = None,
    recipient_street: str | None = None,
    recipient_email: str | None = None,
    recipient_phone: str | None = None,
    recipient_contact: str | None = None,
    recipient_id: str = "0",
    recipient_city: str | None = None,
    recipient_province: str = "",
    description: str | None = None,
    pickup_date: str | None = None,
    pickup_slot: str | None = None,
):
    from travelbox.models import Package, ShipmentDraft

    return ShipmentDraft(
        sender_id=sender["id"],
        sender_name=sender_name or sender.get("name") or None,
        sender_street=sender_street or sender.get("street") or None,
        sender_email=sender_email or sender.get("email") or None,
        sender_phone=sender_phone or sender.get("phone") or sender.get("mobile") or None,
        sender_contact=sender_contact or sender.get("contact") or sender.get("name") or None,
        recipient_id=recipient_id,
        sender_city=city_for_cap(req.origin_cap),
        sender_cap=req.origin_cap,
        sender_province=(sender.get("province") or "") if req.origin_cap == sender.get("cap") else "",
        recipient_city=recipient_city or city_for_cap(req.dest_cap),
        recipient_cap=req.dest_cap,
        recipient_province=recipient_province,
        recipient_name=recipient_name,
        recipient_street=recipient_street,
        recipient_email=recipient_email,
        recipient_phone=recipient_phone,
        recipient_contact=recipient_contact,
        description=description,
        pickup_date=pickup_date,
        pickup_slot=pickup_slot,
        packages=[
            Package(
                pieces=req.pieces,
                weight_kg=req.weight_kg,
                width_cm=req.width_cm,
                height_cm=req.height_cm,
                length_cm=req.length_cm,
                type="pallet" if req.is_pallet else "pacchi",
            )
        ],
        service_type="nazionale",
    )


def quote_with_travelbox(req: QuoteRequest, user: User | None) -> QuoteResponse | None:
    if not TRAVELBOX_QUOTES_ENABLED:
        return None
    if not _settings.userid or not _settings.password:
        return None
    if user is None and not TRAVELBOX_QUOTES_PUBLIC:
        return None

    key = (
        req.origin_cap,
        req.dest_cap,
        round(req.weight_kg, 3),
        round(req.length_cm, 2),
        round(req.width_cm, 2),
        round(req.height_cm, 2),
        req.pieces,
        req.is_pallet,
    )
    cached = _cache_get(key)
    if cached is not None:
        return cached

    sender = _resolve_sender()
    if sender is None:
        logger.warning("TravelBox: nessun mittente configurato o disponibile in rubrica")
        return None

    draft = _build_draft(req, sender)

    try:
        with _client_lock:
            result = get_client().quote(draft)
    except Exception:
        logger.exception("TravelBox: preventivo non disponibile")
        return None

    billable, volumetric = billable_weight(req)
    zone = PALLET_ZONES[pallet_zone(req.origin_cap, req.dest_cap)] if req.is_pallet else None

    quotes: list[CourierQuote] = []
    for offer in result.offers:
        net = _amount(offer.net_price)
        tax = _amount(offer.tax)
        total = _amount(offer.price) or round(net + tax, 2)
        courier = _carrier_id(offer.carrier)
        quotes.append(
            CourierQuote(
                id=offer.id,
                courier=courier,  # type: ignore[arg-type]
                courier_name=FRIENDLY.get(courier, offer.carrier or "Corriere"),
                service_name=offer.carrier or offer.service or "TravelBox",
                delivery_time=offer.delivery_days or "Tempi indicati dal portale",
                features=[],
                base_cost=round(net, 2),
                fuel_surcharge=round(tax, 2),
                markup=0.0,
                price=round(total, 2),
                source="travelbox",
                price_includes_vat=True,
            )
        )

    response = QuoteResponse(
        is_pallet=req.is_pallet,
        pallet_zone=zone,
        billable_weight_kg=billable,
        volumetric_weight_kg=volumetric,
        origin_city=city_for_cap(req.origin_cap),
        dest_city=city_for_cap(req.dest_cap),
        quotes=quotes,
        provider="travelbox",
        notice=result.message or (None if quotes else "Nessuna offerta TravelBox per questa tratta"),
        sender=QuoteParty(
            name=sender.get("name") or None,
            street=sender.get("street") or None,
            city=city_for_cap(req.origin_cap),
            province=sender.get("province") or None,
            postal_code=req.origin_cap,
            email=sender.get("email") or None,
            phone=sender.get("phone") or sender.get("mobile") or None,
            contact=sender.get("contact") or sender.get("name") or None,
        ),
    )
    _cache_set(key, response)
    return response


def preview_travelbox_booking(
    req: QuoteRequest,
    offer_id: str,
    recipient_name: str | None = None,
    recipient_address: str | None = None,
    recipient_email: str | None = None,
    recipient_phone: str | None = None,
    recipient_contact: str | None = None,
    sender_name: str | None = None,
    sender_address: str | None = None,
    sender_email: str | None = None,
    sender_phone: str | None = None,
    sender_contact: str | None = None,
):
    if not TRAVELBOX_QUOTES_ENABLED or not _settings.userid or not _settings.password:
        return None
    sender = _resolve_sender()
    if sender is None:
        return None

    city = city_for_cap(req.dest_cap)
    province = ""
    client = get_client()
    with _client_lock:
        resolved = client.resolve_comune(req.dest_cap, city)
        if resolved:
            city = str(resolved.get("nome") or city)
            province = str(resolved.get("provincia") or "")

    draft = _build_draft(
        req,
        sender,
        sender_name=sender_name,
        sender_street=sender_address,
        sender_email=sender_email,
        sender_phone=sender_phone,
        sender_contact=sender_contact,
        recipient_name=recipient_name,
        recipient_street=recipient_address,
        recipient_email=recipient_email,
        recipient_phone=recipient_phone,
        recipient_contact=recipient_contact,
        recipient_id="0",
        recipient_city=city,
        recipient_province=province,
    )
    with _client_lock:
        result = client.booking_form(draft, offer_id)
    return {
        "offer": result["offer"].model_dump(),
        "action": result["action"],
        "fields": result["fields"],
        "controls": result["controls"],
        "preview_status": result["preview_status"],
        "preview_length": result["preview_length"],
    }


def create_travelbox_shipment(
    req: QuoteRequest,
    offer_id: str,
    recipient_name: str,
    recipient_address: str,
    recipient_email: str | None,
    recipient_phone: str | None = None,
    recipient_contact: str | None = None,
    sender_name: str | None = None,
    sender_address: str | None = None,
    sender_email: str | None = None,
    sender_phone: str | None = None,
    sender_contact: str | None = None,
    description: str | None = None,
    pickup_date: str | None = None,
    pickup_slot: str | None = None,
    confirm: bool = True,
):
    if not TRAVELBOX_QUOTES_ENABLED or not _settings.userid or not _settings.password:
        return None

    sender = _resolve_sender()
    if sender is None:
        return None

    city = city_for_cap(req.dest_cap)
    province = ""
    client = get_client()
    created_recipient = False
    with _client_lock:
        resolved = client.resolve_comune(req.dest_cap, city)
        if resolved:
            city = str(resolved.get("nome") or city)
            province = str(resolved.get("provincia") or "")
        recipient_id = client.find_recipient(recipient_name, recipient_address, req.dest_cap)
        if not recipient_id:
            anagrafica_id = sender.get("anagrafica_id") or client.account_anagrafica_id()
            recipient_id = client.create_recipient(
                name=recipient_name,
                street=recipient_address,
                cap=req.dest_cap,
                city=city,
                province=province,
                email=recipient_email,
                phone=recipient_phone,
                contact=recipient_contact,
                anagrafica_id=anagrafica_id,
            )
            created_recipient = True

    draft = _build_draft(
        req,
        sender,
        sender_name=sender_name,
        sender_street=sender_address,
        sender_email=sender_email,
        sender_phone=sender_phone,
        sender_contact=sender_contact,
        recipient_name=recipient_name,
        recipient_street=recipient_address,
        recipient_email=recipient_email,
        recipient_phone=recipient_phone,
        recipient_contact=recipient_contact,
        recipient_id=recipient_id,
        recipient_city=city,
        recipient_province=province,
        description=description,
        pickup_date=pickup_date,
        pickup_slot=pickup_slot,
    )
    try:
        with _client_lock:
            result = client.create_shipment(draft, offer_id, confirm)
    except Exception:
        if created_recipient:
            with _client_lock:
                try:
                    client.ensure_session()
                    client.delete_recipient(recipient_id)
                except Exception:
                    logger.exception("TravelBox: impossibile rimuovere il destinatario temporaneo")
        raise

    try:
        from travelbox.api import clear_cache

        clear_cache()
    except Exception:
        logger.exception("TravelBox: impossibile pulire la cache dopo la creazione")
    return result
