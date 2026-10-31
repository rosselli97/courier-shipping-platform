from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from travelbox.api import get_client
from travelbox.client import AuthError, NoOffers, NotFound, UpstreamError, WriteNotAvailable

from ..database import get_db
from ..deps import get_active_user
from ..models import Shipment, User
from ..schemas import TravelBoxCheckoutRequest, TravelBoxCheckoutResponse
from ..shipments import (
    record_travelbox_history,
    record_travelbox_shipment,
    travelbox_status_importable,
)
from ..travelbox_quotes import client_lock, create_travelbox_shipment, preview_travelbox_booking

router = APIRouter(tags=["travelbox"])
logger = logging.getLogger("muvpack.travelbox.checkout")


@router.post("/travelbox/preview")
def preview(body: TravelBoxCheckoutRequest, user: User = Depends(get_active_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato all'amministrazione")
    try:
        result = preview_travelbox_booking(
            body,
            body.offer_id,
            body.recipient_name,
            body.recipient_address,
            body.recipient_email,
            body.recipient_phone,
            body.recipient_contact,
            body.sender_name,
            body.sender_address,
            body.sender_email,
            body.sender_phone,
            body.sender_contact,
        )
    except AuthError as exc:
        raise HTTPException(status_code=502, detail=f"Login TravelBox non riuscito: {exc}") from exc
    except NoOffers as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except WriteNotAvailable as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except UpstreamError as exc:
        logger.warning("TravelBox preview upstream error: %s %s", exc.status_code, exc.path)
        raise HTTPException(status_code=502, detail="Errore dal portale TravelBox") from exc
    except Exception as exc:
        logger.exception("TravelBox preview failed")
        raise HTTPException(status_code=502, detail="Preview TravelBox non riuscita") from exc
    if result is None:
        raise HTTPException(status_code=503, detail="TravelBox non configurato")
    return result


@router.post("/travelbox/checkout", response_model=TravelBoxCheckoutResponse)
def checkout(
    body: TravelBoxCheckoutRequest,
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
):
    if user.role not in ("admin", "reseller"):
        raise HTTPException(status_code=403, detail="Accesso non consentito")

    try:
        result = create_travelbox_shipment(
            body,
            body.offer_id,
            body.recipient_name.strip(),
            body.recipient_address.strip(),
            body.recipient_email,
            body.recipient_phone,
            body.recipient_contact,
            body.sender_name,
            body.sender_address,
            body.sender_email,
            body.sender_phone,
            body.sender_contact,
            body.description,
            body.pickup_date,
            body.pickup_slot,
            body.confirm,
        )
    except AuthError as exc:
        raise HTTPException(status_code=502, detail=f"Login TravelBox non riuscito: {exc}") from exc
    except NoOffers as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except WriteNotAvailable as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except UpstreamError as exc:
        logger.warning("TravelBox checkout upstream error: %s %s", exc.status_code, exc.path)
        raise HTTPException(
            status_code=502,
            detail="Il portale TravelBox ha rifiutato la creazione. Riprova o verifica i dati sul portale.",
        ) from exc
    except Exception as exc:
        logger.exception("TravelBox checkout failed")
        raise HTTPException(status_code=502, detail="Creazione TravelBox non riuscita") from exc

    if result is None:
        raise HTTPException(status_code=503, detail="TravelBox non configurato")

    message = result.message
    if result.status == "submitted":
        try:
            local = record_travelbox_shipment(db, user, body, result)
            if local is not None:
                message = f"{message} Registrata nelle spedizioni MUVPACK."
        except Exception:
            db.rollback()
            logger.exception("TravelBox: impossibile registrare la spedizione locale")
            message = f"{message} Attenzione: spedizione non registrata nell'elenco MUVPACK."

    shipment = result.shipment
    return TravelBoxCheckoutResponse(
        status=result.status,
        message=message,
        reference=shipment.reference if shipment else None,
        tracking_number=shipment.tracking_number if shipment else None,
        shipment_id=shipment.id if shipment else None,
        label_token=shipment.label_token if shipment else None,
    )


@router.post("/travelbox/import-history")
def import_history(
    user: User = Depends(get_active_user),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
):
    """Importa a blocchi lo storico TravelBox nell'elenco spedizioni MUVPACK.

    Pensato per essere richiamato piu' volte dall'admin: ogni chiamata importa
    fino a `limit` spedizioni nuove della pagina richiesta. Le annullate/rifiutate
    e le spedizioni gia' presenti vengono saltate.
    """
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accesso riservato all'amministrazione")

    year = date.today().year
    start = date_from or f"{year}-01-01"
    end = date_to or f"{year}-12-31"

    client = get_client()
    try:
        with client_lock:
            rows = client.shipments(page=page, data_dal=start, data_al=end)
    except Exception as exc:
        logger.exception("TravelBox import: elenco non disponibile")
        raise HTTPException(status_code=502, detail="Elenco spedizioni TravelBox non disponibile") from exc

    refs = [(row.reference or "").strip().upper() for row in rows if row.reference]
    existing: set[str] = set()
    if refs:
        existing = set(
            db.scalars(select(Shipment.tracking_code).where(Shipment.tracking_code.in_(refs)))
        )

    pending = [
        row
        for row in rows
        if row.reference
        and row.reference.strip().upper() not in existing
        and travelbox_status_importable(row.status)
    ]

    imported = 0
    failed = 0
    for remote in pending[:limit]:
        detail = None
        try:
            with client_lock:
                detail = client.shipment_detail(remote.id or remote.reference or "")
        except Exception:
            logger.warning(
                "TravelBox import: dettaglio non disponibile per %s", remote.reference, exc_info=True
            )
        if detail is not None and not travelbox_status_importable(detail.status):
            continue
        try:
            if record_travelbox_history(db, user, remote, detail) is not None:
                imported += 1
        except Exception:
            db.rollback()
            failed += 1
            logger.exception("TravelBox import: impossibile registrare %s", remote.reference)

    processed = imported + failed
    return {
        "page": page,
        "date_from": start,
        "date_to": end,
        "total": len(rows),
        "pending": len(pending),
        "imported": imported,
        "failed": failed,
        "remaining": max(0, len(pending) - processed),
    }
