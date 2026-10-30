from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import SESSION_COOKIE
from .database import get_db
from .models import User
from .security import read_session_token


def get_optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    user_id = read_session_token(token)
    if not user_id:
        return None
    return db.get(User, user_id)


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non autenticato")
    return user


def get_active_user(user: User = Depends(get_current_user)) -> User:
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account sospeso")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato all'amministrazione")
    return user


def require_reseller(user: User = Depends(get_current_user)) -> User:
    if user.role != "reseller":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato ai rivenditori")
    return user


def require_active_reseller(user: User = Depends(get_active_user)) -> User:
    if user.role != "reseller":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso riservato ai rivenditori")
    return user
