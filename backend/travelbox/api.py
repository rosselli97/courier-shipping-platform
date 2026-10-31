"""API layer: letture, preventivi, creazione (due fasi) ed etichette.

Avvio:
    .venv/bin/uvicorn travelbox.api:app --reload --port 8000

Docs: http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable, Optional, TypeVar

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .client import (
    AuthError,
    NoOffers,
    NotFound,
    TravelBoxClient,
    UpstreamError,
    WriteNotAvailable,
)
from .config import Settings
from .models import (
    AddressBookEntry,
    CreateShipmentResult,
    Health,
    Invoice,
    LabelGroup,
    Quote,
    QuoteResult,
    RateList,
    Shipment,
    ShipmentDraft,
)

T = TypeVar("T")

app = FastAPI(
    title="TravelBox Contorno Connector",
    version="0.3.0",
    description=(
        "API non ufficiale sopra il portale TravelBox Contorno: letture, "
        "preventivi, creazione in due fasi (preview / carrello) ed etichette PDF. "
        "Il connettore non chiama mai gli endpoint di pagamento."
    ),
)

_settings = Settings()
_client: Optional[TravelBoxClient] = None
_cache: dict[str, tuple[float, Any]] = {}


def get_client() -> TravelBoxClient:
    global _client
    if _client is None:
        _client = TravelBoxClient(_settings)
    return _client


def cached(key: str, ttl: int, loader: Callable[[], T]) -> T:
    entry = _cache.get(key)
    now = time.monotonic()
    if entry and now - entry[0] < ttl:
        return entry[1]
    value = loader()
    _cache[key] = (now, value)
    return value


async def run(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Esegue il client sincrono senza bloccare l'event loop."""
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
    except AuthError as exc:
        raise HTTPException(status_code=502, detail=f"Login al portale fallito: {exc}") from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NoOffers as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except WriteNotAvailable as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except UpstreamError as exc:
        raise HTTPException(
            status_code=502,
            detail={"message": "Errore dal portale", "status": exc.status_code, "path": exc.path},
        ) from exc


@app.exception_handler(Exception)
async def unhandled(_request: Any, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"detail": f"Errore interno: {exc}"})


class CreateShipmentRequest(BaseModel):
    draft: ShipmentDraft
    offer_id: Optional[str] = None
    confirm: bool = False


class MergeLabelsRequest(BaseModel):
    shipment_ids: list[int | str] = Field(min_length=1)
    group_id: str


@app.get("/health", response_model=Health, tags=["system"])
async def health() -> Health:
    return await run(get_client().health)


@app.get("/shipments", response_model=list[Shipment], tags=["shipments"])
async def shipments(
    page: int = Query(1, ge=1),
    status: str = "",
    tracking: str = "",
    carrier: str = "",
    date_from: str = "",
    date_to: str = "",
    refresh: bool = False,
) -> list[Shipment]:
    key = f"shipments:{page}:{status}:{tracking}:{carrier}:{date_from}:{date_to}"
    if refresh:
        _cache.pop(key, None)
    return await run(
        lambda: cached(
            key,
            _settings.cache_ttl,
            lambda: get_client().shipments(
                page=page,
                stato=status,
                tracking=tracking,
                corriere=carrier,
                data_dal=date_from,
                data_al=date_to,
            ),
        )
    )


@app.post("/shipments/quote", response_model=QuoteResult, tags=["shipments"])
async def quote(draft: ShipmentDraft) -> QuoteResult:
    """Preventivo: nessuna spedizione viene creata."""
    return await run(get_client().quote, draft)


@app.post("/shipments", response_model=CreateShipmentResult, tags=["shipments"])
async def create_shipment(payload: CreateShipmentRequest) -> CreateShipmentResult:
    """Crea una spedizione in due fasi.

    Default `confirm=false`: restituisce solo la preview con l'offerta scelta.
    Con `confirm=true` apre `creaspedizione/...` e invia il form di conferma con
    `metodo_pagamento=carrello`: la spedizione finisce nel carrello, **senza**
    pagamento. Il connettore non chiama mai gli endpoint di checkout.
    """
    result = await run(
        get_client().create_shipment,
        payload.draft,
        payload.offer_id,
        payload.confirm,
    )
    _cache.clear()
    return result


@app.get("/cart", response_model=list[Shipment], tags=["shipments"])
async def cart(refresh: bool = False) -> list[Shipment]:
    """Spedizioni create ma non pagate, con lo stato IN CARRELLO."""
    key = "cart"
    if refresh:
        _cache.pop(key, None)
    return await run(lambda: cached(key, _settings.cache_ttl, get_client().cart))


@app.get("/shipments/{shipment_id}", response_model=Shipment, tags=["shipments"])
async def shipment_detail(shipment_id: str) -> Shipment:
    return await run(get_client().shipment_detail, shipment_id)


@app.get("/shipments/{shipment_id}/label", tags=["labels"])
async def shipment_label(
    shipment_id: str,
    token: str = "",
) -> Response:
    """Scarica il PDF etichetta della spedizione.

    Se `token` non e' passato, viene ricavato dal dettaglio della spedizione.
    """
    client = get_client()
    label_token = token
    if not label_token:
        shipment = await run(client.shipment_detail, shipment_id)
        label_token = shipment.label_token or ""
    if not label_token:
        raise HTTPException(status_code=404, detail="Nessuna etichetta disponibile per la spedizione")

    label = await run(client.download_label, label_token)
    filename = label.filename or f"etichetta-{shipment_id}.pdf"
    return Response(
        content=label.content,
        media_type=label.content_type or "application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Label-Size": str(label.size or 0),
        },
    )


@app.post("/shipments/{shipment_id}/request-label", tags=["labels"])
async def request_label(shipment_id: str) -> dict[str, Any]:
    """Chiede al portale di preparare le etichette (puo' richiedere tempo)."""
    return await run(get_client().request_labels, shipment_id)


@app.get("/label-groups", response_model=list[LabelGroup], tags=["labels"])
async def label_groups() -> list[LabelGroup]:
    return await run(lambda: cached("label-groups", _settings.cache_ttl, get_client().label_groups))


@app.post("/labels/merge", tags=["labels"])
async def merge_labels(payload: MergeLabelsRequest) -> Response:
    """Unisce le etichette di piu' spedizioni in un unico PDF."""
    label = await run(get_client().merge_labels, payload.shipment_ids, payload.group_id)
    filename = label.filename or "etichette.pdf"
    return Response(
        content=label.content,
        media_type=label.content_type or "application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Label-Size": str(label.size or 0),
        },
    )


@app.get("/labels/{token:path}", tags=["labels"])
async def label_by_token(token: str) -> Response:
    label = await run(get_client().download_label, token)
    filename = label.filename or "etichetta.pdf"
    return Response(
        content=label.content,
        media_type=label.content_type or "application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Label-Size": str(label.size or 0),
        },
    )


@app.get("/quotes", response_model=list[Quote], tags=["quotes"])
async def quotes(
    page: int = Query(1, ge=1),
    status: str = "",
    refresh: bool = False,
) -> list[Quote]:
    key = f"quotes:{page}:{status}"
    if refresh:
        _cache.pop(key, None)
    return await run(
        lambda: cached(key, _settings.cache_ttl, lambda: get_client().quotes(page=page, stato=status))
    )


@app.get("/rates", response_model=list[RateList], tags=["rates"])
async def rates(refresh: bool = False) -> list[RateList]:
    key = "rates"
    if refresh:
        _cache.pop(key, None)
    return await run(lambda: cached(key, _settings.cache_ttl * 4, get_client().rate_lists))


@app.get("/invoices", response_model=list[Invoice], tags=["invoices"])
async def invoices(refresh: bool = False) -> list[Invoice]:
    key = "invoices"
    if refresh:
        _cache.pop(key, None)
    return await run(lambda: cached(key, _settings.cache_ttl, get_client().invoices))


@app.get("/address-book", response_model=list[AddressBookEntry], tags=["address-book"])
async def address_book(refresh: bool = False) -> list[AddressBookEntry]:
    key = "address-book"
    if refresh:
        _cache.pop(key, None)
    return await run(lambda: cached(key, _settings.cache_ttl * 2, get_client().address_book))
