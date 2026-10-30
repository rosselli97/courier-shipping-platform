from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Ticket, TicketMessage, User
from ..schemas import TicketCreate, TicketDetail, TicketReplyBody, TicketStatusBody, TicketSummary
from ..serializers import ticket_detail, ticket_summary

router = APIRouter(prefix="/tickets", tags=["tickets"])

ADMIN_NAME = "Supporto MUVPACK"


def _ticket(db: Session, ticket_id: str, user: User) -> Ticket:
    ticket = db.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket non trovato")
    if user.role == "reseller" and ticket.client_id != user.id:
        raise HTTPException(status_code=404, detail="Ticket non trovato")
    return ticket


def _visible(db: Session, user: User) -> list[Ticket]:
    query = select(Ticket).order_by(Ticket.updated_at.desc())
    if user.role == "reseller":
        query = query.where(Ticket.client_id == user.id)
    return list(db.scalars(query))


@router.get("", response_model=list[TicketSummary])
def list_tickets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [ticket_summary(ticket, user.role) for ticket in _visible(db, user)]


@router.post("", response_model=TicketDetail, status_code=201)
def create_ticket(body: TicketCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "reseller":
        raise HTTPException(status_code=403, detail="Solo i rivenditori possono aprire ticket")
    last = db.scalar(select(func.max(Ticket.number))) or 0
    now = datetime.now(timezone.utc)
    ticket = Ticket(
        number=last + 1,
        client_id=user.id,
        subject=body.subject.strip(),
        category=body.category,
        tracking_code=(body.tracking_code or "").strip().upper() or None,
        status="open",
        unread_for_admin=True,
        unread_for_reseller=False,
        created_at=now,
        updated_at=now,
    )
    db.add(ticket)
    db.flush()
    db.add(
        TicketMessage(
            ticket_id=ticket.id,
            author_role="reseller",
            author_name=user.company_name,
            body=body.message.strip(),
            created_at=now,
        )
    )
    db.commit()
    db.refresh(ticket)
    return ticket_detail(ticket, user.role)


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_ticket(ticket_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = _ticket(db, ticket_id, user)
    if user.role == "admin" and ticket.unread_for_admin:
        ticket.unread_for_admin = False
        db.commit()
        db.refresh(ticket)
    elif user.role == "reseller" and ticket.unread_for_reseller:
        ticket.unread_for_reseller = False
        db.commit()
        db.refresh(ticket)
    return ticket_detail(ticket, user.role)


@router.post("/{ticket_id}/messages", response_model=TicketDetail)
def reply(ticket_id: str, body: TicketReplyBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = _ticket(db, ticket_id, user)
    now = datetime.now(timezone.utc)
    db.add(
        TicketMessage(
            ticket_id=ticket.id,
            author_role=user.role,
            author_name=user.company_name if user.role == "reseller" else ADMIN_NAME,
            body=body.body.strip(),
            created_at=now,
        )
    )
    if user.role == "admin":
        ticket.status = "answered"
        ticket.unread_for_reseller = True
        ticket.unread_for_admin = False
    else:
        ticket.status = "open"
        ticket.unread_for_admin = True
        ticket.unread_for_reseller = False
    ticket.updated_at = now
    db.commit()
    db.refresh(ticket)
    return ticket_detail(ticket, user.role)


@router.patch("/{ticket_id}/status", response_model=TicketDetail)
def set_status(ticket_id: str, body: TicketStatusBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ticket = _ticket(db, ticket_id, user)
    ticket.status = body.status
    ticket.updated_at = datetime.now(timezone.utc)
    if user.role == "admin":
        ticket.unread_for_admin = False
    db.commit()
    db.refresh(ticket)
    return ticket_detail(ticket, user.role)
