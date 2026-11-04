from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import User
from app.notifications import (
    NotificationError,
    list_all,
    list_for_user,
    mark_all_read,
    mark_read,
    send_notifications,
)
from app.schemas import NotificationSendBody


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)()


def _user(db, email: str, role: str, company: str) -> User:
    user = User(
        email=email,
        password_hash="x",
        role=role,
        company_name=company,
        vat_number="",
        wallet_balance=0.0,
        status="active",
        self_registered=True,
    )
    db.add(user)
    db.flush()
    return user


def _setup():
    db = _session()
    admin = _user(db, "admin@test.it", "admin", "MUVPACK")
    first = _user(db, "first@test.it", "reseller", "Primo Cliente")
    second = _user(db, "second@test.it", "reseller", "Secondo Cliente")
    db.commit()
    return db, admin, first, second


def test_send_to_all_and_read_flow():
    db, admin, first, second = _setup()

    created = send_notifications(
        db,
        admin,
        NotificationSendBody(title="  Manutenzione  ", body="  Stasera alle 22.  ", audience="all"),
    )
    assert created == 3

    inbox = list_for_user(db, first.id)
    assert inbox.unread == 1
    assert inbox.items[0].title == "Manutenzione"
    assert inbox.items[0].body == "Stasera alle 22."
    assert inbox.items[0].sender_name == "MUVPACK"

    marked = mark_read(db, first.id, inbox.items[0].id)
    assert marked.read_at is not None
    assert list_for_user(db, first.id).unread == 0

    assert mark_all_read(db, second.id) == 1
    assert list_for_user(db, second.id).unread == 0


def test_send_to_resellers_only():
    db, admin, first, second = _setup()

    created = send_notifications(
        db, admin, NotificationSendBody(title="Solo B2B", body="Messaggio", audience="resellers")
    )
    assert created == 2
    assert list_for_user(db, admin.id).unread == 0
    assert list_for_user(db, first.id).unread == 1
    assert list_for_user(db, second.id).unread == 1


def test_send_to_selected_validates_recipients():
    db, admin, first, second = _setup()

    created = send_notifications(
        db,
        admin,
        NotificationSendBody(
            title="Mirato", body="Solo a te", audience="selected", recipient_ids=[second.id]
        ),
    )
    assert created == 1
    assert list_for_user(db, first.id).unread == 0
    assert list_for_user(db, second.id).unread == 1

    with pytest.raises(NotificationError):
        send_notifications(
            db,
            admin,
            NotificationSendBody(title="Errore", body="Destinatario inesistente", audience="selected"),
        )

    with pytest.raises(NotificationError):
        send_notifications(
            db,
            admin,
            NotificationSendBody(
                title="Errore", body="Destinatario inesistente", audience="selected", recipient_ids=["missing"]
            ),
        )


def test_admin_sees_all_profiles_notifications():
    db, admin, first, second = _setup()
    send_notifications(db, admin, NotificationSendBody(title="A", body="uno", audience="all"))
    send_notifications(
        db,
        admin,
        NotificationSendBody(title="B", body="due", audience="selected", recipient_ids=[first.id]),
    )

    rows = list_all(db)
    assert len(rows) == 4
    recipients = {row.recipient_email for row in rows}
    assert recipients == {"admin@test.it", "first@test.it", "second@test.it"}
    assert all(row.sender_name == "MUVPACK" for row in rows)
    assert {row.title for row in rows} == {"A", "B"}
