from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from travelbox import parsers
from travelbox.api import get_client

from ..database import get_db
from ..deps import require_admin
from ..models import Shipment, User
from ..schemas import ShipmentSearchResponse, ShipmentSearchResult
from ..serializers import iso
from ..travelbox_quotes import client_lock

router = APIRouter(prefix="/admin", tags=["search"])
logger = logging.getLogger("muvpack.search")


def _local_result(shipment: Shipment, base_url: str) -> ShipmentSearchResult:
    portal_url = None
    code = (shipment.tracking_code or "").upper()
    if code.startswith("TBC-"):
        try:
            token = parsers.encode_shipment_token(code.split("-", 1)[1])
            portal_url = f"{base_url}/vedispedizione/{token}"
        except Exception:
            portal_url = None
    return ShipmentSearchResult(
        source="muvpack",
        reference=shipment.tracking_code,
        tracking_code=shipment.tracking_code,
        status=shipment.status,
        carrier=shipment.courier,
        recipient_name=shipment.recipient_name,
        origin_city=shipment.origin_city,
        dest_city=shipment.dest_city,
        created_at=iso(shipment.created_at),
        price=round(shipment.price, 2),
        local_id=shipment.id,
        local=True,
        portal_url=portal_url,
    )


def _remote_result(shipment, base_url: str) -> ShipmentSearchResult:
    price = None
    if shipment.price is not None and shipment.price.amount is not None:
        price = float(shipment.price.amount)
    return ShipmentSearchResult(
        source="travelbox",
        reference=shipment.reference,
        tracking_code=shipment.reference,
        tracking_number=shipment.tracking_number,
        status=shipment.status,
        carrier=shipment.carrier,
        sender_name=shipment.sender.name if shipment.sender else None,
        created_at=shipment.created_at,
        price=round(price, 2) if price is not None else None,
        local=False,
        portal_url=f"{base_url}{shipment.detail_url}" if shipment.detail_url else None,
    )


def _travelbox_results(term: str, local_refs: set[str], limit: int = 8) -> list[ShipmentSearchResult]:
    client = get_client()
    base_url = client.settings.base_url.rstrip("/")
    today = date.today()
    start = date(today.year - 3, 1, 1).isoformat()
    end = (today + timedelta(days=1)).isoformat()
    upper = term.upper()

    if upper.startswith("TBC-") or (len(term) >= 6 and " " not in term and any(ch.isdigit() for ch in term)):
        attempts = ({"numero_interno": term}, {"tracking": term})
    else:
        attempts = ({"destinatario": term}, {"mittente": term})

    found: dict[str, ShipmentSearchResult] = {}
    for filters in attempts:
        with client_lock:
            rows = client.shipments(page=1, data_dal=start, data_al=end, **filters)
        for row in rows:
            reference = (row.reference or "").upper()
            if not reference or reference in local_refs or reference in found:
                continue
            found[reference] = _remote_result(row, base_url)
            if len(found) >= limit:
                break
        if len(found) >= limit:
            break
    return list(found.values())


@router.get("/shipment-search", response_model=ShipmentSearchResponse)
def search_shipments(
    q: str = Query(..., min_length=2),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Cerca una spedizione in MUVPACK e sul portale TravelBox."""
    term = q.strip()
    pattern = f"%{term}%"
    local_rows = list(
        db.scalars(
            select(Shipment)
            .where(
                or_(
                    Shipment.tracking_code.ilike(pattern),
                    Shipment.recipient_name.ilike(pattern),
                    Shipment.origin_city.ilike(pattern),
                    Shipment.dest_city.ilike(pattern),
                )
            )
            .order_by(Shipment.created_at.desc())
            .limit(20)
        )
    )
    try:
        base_url = get_client().settings.base_url.rstrip("/")
    except Exception:
        base_url = ""
    results = [_local_result(shipment, base_url) for shipment in local_rows]
    local_refs = {(shipment.tracking_code or "").upper() for shipment in local_rows}

    notice = None
    try:
        remote_results = _travelbox_results(term, local_refs)
        remote_refs = [(item.reference or "").upper() for item in remote_results if item.reference]
        local_by_ref: dict[str, Shipment] = {}
        if remote_refs:
            local_by_ref = {
                shipment.tracking_code.upper(): shipment
                for shipment in db.scalars(select(Shipment).where(Shipment.tracking_code.in_(remote_refs)))
            }
        for item in remote_results:
            local = local_by_ref.get((item.reference or "").upper())
            if local is None:
                results.append(item)
                continue
            # La spedizione esiste anche in MUVPACK: mostra il record locale,
            # conservando tracking e link al portale TravelBox.
            merged = _local_result(local, base_url)
            merged.portal_url = item.portal_url or merged.portal_url
            merged.tracking_number = item.tracking_number or merged.tracking_number
            results.append(merged)
    except Exception:
        logger.exception("Ricerca TravelBox non riuscita")
        notice = "Ricerca TravelBox non disponibile in questo momento. Sono mostrati solo i risultati MUVPACK."

    return ShipmentSearchResponse(results=results, notice=notice)
