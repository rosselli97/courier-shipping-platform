from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from travelbox.client import AuthError, NoOffers, NotFound, UpstreamError, WriteNotAvailable

from ..deps import get_active_user
from ..models import User
from ..schemas import TravelBoxCheckoutRequest, TravelBoxCheckoutResponse
from ..travelbox_quotes import create_travelbox_shipment

router = APIRouter(tags=["travelbox"])
logger = logging.getLogger("muvpack.travelbox.checkout")


@router.post("/travelbox/checkout", response_model=TravelBoxCheckoutResponse)
def checkout(body: TravelBoxCheckoutRequest, user: User = Depends(get_active_user)):
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

    shipment = result.shipment
    return TravelBoxCheckoutResponse(
        status=result.status,
        message=result.message,
        reference=shipment.reference if shipment else None,
        tracking_number=shipment.tracking_number if shipment else None,
        shipment_id=shipment.id if shipment else None,
        label_token=shipment.label_token if shipment else None,
    )
