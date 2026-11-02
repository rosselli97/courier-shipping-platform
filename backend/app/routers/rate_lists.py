from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_admin
from ..models import User
from ..rate_lists import (
    import_rate_lists,
    list_rate_lists,
    rate_list_detail,
    set_rate_list_active,
    set_rate_list_markups,
)
from ..schemas import (
    RateListActiveBody,
    RateListDetailOut,
    RateListImportResult,
    RateListMarkupsBody,
    RateListOut,
)

router = APIRouter(tags=["rate-lists"])


@router.post("/travelbox/rate-lists/import", response_model=RateListImportResult)
def import_lists(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return import_rate_lists(db)


@router.get("/travelbox/rate-lists", response_model=list[RateListOut])
def get_rate_lists(
    client_id: str | None = Query(None),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if client_id:
        client = db.get(User, client_id)
        if client is None or client.role != "reseller":
            raise HTTPException(status_code=404, detail="Cliente non trovato")
    return list_rate_lists(db, client_id)


@router.put("/travelbox/rate-lists/markups", response_model=list[RateListOut])
def put_rate_list_markups(
    body: RateListMarkupsBody,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        return set_rate_list_markups(
            db,
            body.client_id,
            [rule.model_dump() for rule in body.rules],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/travelbox/rate-lists/{list_id}", response_model=RateListDetailOut)
def get_rate_list_detail(
    list_id: str,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    detail = rate_list_detail(db, list_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Listino non trovato")
    return detail


@router.patch("/travelbox/rate-lists/{list_id}", response_model=RateListOut)
def patch_rate_list(
    list_id: str,
    body: RateListActiveBody,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    updated = set_rate_list_active(db, list_id, body.active)
    if updated is None:
        raise HTTPException(status_code=404, detail="Listino non trovato")
    return updated
