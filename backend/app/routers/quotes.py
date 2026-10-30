from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_optional_user
from ..models import User
from ..pricing import build_quote
from ..schemas import QuoteRequest, QuoteResponse

router = APIRouter(tags=["quote"])


@router.post("/quote", response_model=QuoteResponse)
def quote(body: QuoteRequest, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    return build_quote(db, body, user)
