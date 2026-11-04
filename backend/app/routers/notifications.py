from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..notifications import NotificationError, list_for_user, mark_all_read, mark_read
from ..schemas import NotificationList, NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationList)
def my_notifications(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return list_for_user(db, user.id)


@router.post("/read-all")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"updated": mark_all_read(db, user.id)}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def read_one(
    notification_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return mark_read(db, user.id, notification_id)
    except NotificationError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
