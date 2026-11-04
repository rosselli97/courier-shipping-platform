from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Notification, User, utcnow
from .schemas import AdminNotificationOut, NotificationList, NotificationOut, NotificationSendBody
from .serializers import admin_notification_out, notification_out


class NotificationError(ValueError):
    """Errore applicativo restituito come 422/404 dal router."""


def _recipients(db: Session, body: NotificationSendBody) -> list[User]:
    query = select(User)
    if body.audience == "resellers":
        query = query.where(User.role == "reseller")
    elif body.audience == "selected":
        recipient_ids = list(dict.fromkeys(body.recipient_ids))
        if not recipient_ids:
            raise NotificationError("Seleziona almeno un profilo destinatario")
        users = list(db.scalars(query.where(User.id.in_(recipient_ids))))
        if len(users) != len(recipient_ids):
            raise NotificationError("Uno o più profili selezionati non esistono")
        return users
    return list(db.scalars(query.order_by(User.created_at.asc())))


def send_notifications(db: Session, sender: User, body: NotificationSendBody) -> int:
    recipients = _recipients(db, body)
    for recipient in recipients:
        db.add(
            Notification(
                user_id=recipient.id,
                title=body.title,
                body=body.body,
                created_by=sender.id,
            )
        )
    db.commit()
    return len(recipients)


def _user_names(db: Session, rows: list[Notification]) -> dict[str, User]:
    ids = {row.user_id for row in rows}
    ids.update(row.created_by for row in rows if row.created_by)
    if not ids:
        return {}
    return {user.id: user for user in db.scalars(select(User).where(User.id.in_(ids)))}


def list_for_user(db: Session, user_id: str, limit: int = 100) -> NotificationList:
    rows = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        )
    )
    people = _user_names(db, rows)
    unread = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id, Notification.read_at.is_(None)
        )
    )
    return NotificationList(
        items=[
            notification_out(row, people[row.created_by].company_name if row.created_by else None)
            for row in rows
        ],
        unread=int(unread or 0),
    )


def mark_read(db: Session, user_id: str, notification_id: str) -> NotificationOut:
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user_id:
        raise NotificationError("Notifica non trovata")
    if notification.read_at is None:
        notification.read_at = utcnow()
        db.commit()
        db.refresh(notification)
    sender = db.get(User, notification.created_by) if notification.created_by else None
    return notification_out(notification, sender.company_name if sender else None)


def mark_all_read(db: Session, user_id: str) -> int:
    rows = list(
        db.scalars(
            select(Notification).where(
                Notification.user_id == user_id, Notification.read_at.is_(None)
            )
        )
    )
    now = utcnow()
    for row in rows:
        row.read_at = now
    db.commit()
    return len(rows)


def list_all(db: Session, limit: int = 200) -> list[AdminNotificationOut]:
    rows = list(
        db.scalars(select(Notification).order_by(Notification.created_at.desc()).limit(limit))
    )
    people = _user_names(db, rows)
    return [
        admin_notification_out(
            row,
            people.get(row.user_id),
            people[row.created_by].company_name if row.created_by else None,
        )
        for row in rows
    ]
