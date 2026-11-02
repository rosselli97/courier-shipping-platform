from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..config import TRAVELBOX_QUOTES_ENABLED
from ..database import get_db
from ..deps import get_optional_user
from ..models import User
from ..pricing import build_quote
from ..schemas import QuoteRequest, QuoteResponse
from ..travelbox_quotes import quote_with_travelbox

router = APIRouter(tags=["quote"])
logger = logging.getLogger("muvpack.quote")


@router.post("/quote", response_model=QuoteResponse)
def quote(body: QuoteRequest, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    if body.source in ("auto", "travelbox") and TRAVELBOX_QUOTES_ENABLED:
        travelbox = quote_with_travelbox(body, user, db)
        if travelbox is not None:
            return travelbox

        fallback = build_quote(db, body, user)
        if body.source == "travelbox":
            fallback.notice = (
                "Prezzi reali TravelBox non disponibili: accedi con un account Business o riprova. "
                "Stai vedendo le tariffe demo."
                if user is None
                else "Prezzi reali TravelBox non disponibili in questo momento. Stai vedendo le tariffe demo."
            )
        return fallback

    return build_quote(db, body, user)
