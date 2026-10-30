from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..geo import city_for_cap
from ..models import Contact, User
from ..schemas import ContactInput, ContactOut
from ..serializers import contact_out

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _own(db: Session, contact_id: str, user: User) -> Contact:
    contact = db.get(Contact, contact_id)
    if contact is None or contact.user_id != user.id:
        raise HTTPException(status_code=404, detail="Destinatario non trovato")
    return contact


@router.get("", response_model=list[ContactOut])
def list_contacts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Contact)
        .where(Contact.user_id == user.id)
        .order_by(Contact.uses.desc(), Contact.last_used_at.desc())
    )
    return [contact_out(row) for row in rows]


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(body: ContactInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contact = Contact(
        user_id=user.id,
        name=body.name.strip(),
        address=body.address.strip(),
        cap=body.cap,
        city=city_for_cap(body.cap),
        email=body.email,
        uses=0,
        last_used_at=datetime.now(timezone.utc),
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact_out(contact)


@router.put("/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: str, body: ContactInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contact = _own(db, contact_id, user)
    contact.name = body.name.strip()
    contact.address = body.address.strip()
    contact.cap = body.cap
    contact.city = city_for_cap(body.cap)
    contact.email = body.email
    db.commit()
    db.refresh(contact)
    return contact_out(contact)


@router.delete("/{contact_id}")
def delete_contact(contact_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    contact = _own(db, contact_id, user)
    db.delete(contact)
    db.commit()
    return {"ok": True}
