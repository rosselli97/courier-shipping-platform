from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import COOKIE_SECURE, SESSION_COOKIE, SESSION_MAX_AGE
from ..database import get_db
from ..deps import get_optional_user
from ..models import User
from ..schemas import LoginRequest, SignupRequest, UserPublic
from ..security import create_session_token, hash_password, verify_password
from ..serializers import user_public

router = APIRouter(prefix="/auth", tags=["auth"])

VAT_RE = re.compile(r"^(IT)?\d{11}$")


def _set_session(response: Response, user: User) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(user.id),
        max_age=SESSION_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        path="/",
    )


@router.get("/me", response_model=UserPublic | None)
def me(user: User | None = Depends(get_optional_user)):
    return user_public(user) if user else None


@router.post("/login", response_model=UserPublic)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email o password non validi")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account sospeso")
    _set_session(response, user)
    return user_public(user)


@router.post("/signup", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    vat = body.vat_number.replace(" ", "").upper()
    if not VAT_RE.match(vat):
        raise HTTPException(status_code=422, detail="Partita IVA non valida")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email gia registrata")
    if db.scalar(select(User).where(User.vat_number == vat)):
        raise HTTPException(status_code=409, detail="Partita IVA gia registrata")

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        role="reseller",
        company_name=body.company_name.strip(),
        vat_number=vat,
        contact_name=(body.contact_name or "").strip() or None,
        phone=(body.phone or "").strip() or None,
        address=(body.address or "").strip() or None,
        wallet_balance=0.0,
        status="active",
        self_registered=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _set_session(response, user)
    return user_public(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
