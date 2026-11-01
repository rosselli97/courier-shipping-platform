from __future__ import annotations

import threading
import time

from fastapi import APIRouter, HTTPException, Query

from travelbox.api import get_client

from ..geo import city_for_cap
from ..schemas import ComuneOption
from ..travelbox_quotes import client_lock

router = APIRouter(prefix="/geo", tags=["geo"])

CACHE_TTL = 3600
_cache: dict[str, tuple[float, list[ComuneOption]]] = {}
_cache_lock = threading.Lock()


@router.get("/comuni", response_model=list[ComuneOption])
def comuni(cap: str = Query(..., min_length=5, max_length=5)):
    """Comuni associati a un CAP, per la selezione nel form di preventivo."""
    value = (cap or "").strip()
    if not (value.isdigit() and len(value) == 5):
        raise HTTPException(status_code=422, detail="CAP non valido")

    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(value)
        if cached and now < cached[0]:
            return cached[1]

    options: list[ComuneOption] = []
    try:
        with client_lock:
            options = [ComuneOption(**row) for row in get_client().comuni(value)]
    except Exception:
        options = []

    if not options:
        options = [ComuneOption(nome=city_for_cap(value))]

    with _cache_lock:
        _cache[value] = (now + CACHE_TTL, options)
    return options
