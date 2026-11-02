from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from travelbox.models import Money, Offer, RateList, RateRow

from app.database import Base
from app.models import MarkupRule, TravelBoxRateList, TravelBoxRateRow, User
from app.pricing import effective_rate_markup
from app.rate_lists import (
    import_rate_lists,
    list_rate_lists,
    set_rate_list_active,
    set_rate_list_markups,
)
from app.schemas import QuoteRequest
from app.travelbox_quotes import _build_quotes


class FakeClient:
    def __init__(self) -> None:
        self.rows = [
            RateRow(
                shipment_type="Pacchi",
                tariff_type="Express",
                weight_min=0,
                weight_max=3,
                price=Decimal("6.08"),
                currency="EUR",
            )
        ]

    def rate_lists(self) -> list[RateList]:
        return [
            RateList(
                id="100",
                name="BRT (31)",
                type="NAZIONALE",
                carrier="BRT",
                owner="TEST",
                valid_from="2025-01-01",
                valid_to="2999-01-01",
                cloned_from="BRT",
            )
        ]

    def rate_list_details(self, list_id: str) -> list[RateRow]:
        return self.rows if list_id == "100" else []


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    return db


def _user(db, role: str, email: str) -> User:
    user = User(
        email=email,
        password_hash="x",
        role=role,
        company_name="Azienda " + role,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_import_rate_lists_replaces_rows_and_keeps_active_flag():
    db = _session()
    client = FakeClient()
    result = import_rate_lists(db, client=client)
    assert result["lists"] == 1
    assert result["rows"] == 1

    model = db.get(TravelBoxRateList, "100")
    assert model is not None
    assert model.name == "BRT (31)"
    assert model.active is True
    assert db.query(TravelBoxRateRow).count() == 1

    set_rate_list_active(db, "100", False)
    client.rows = client.rows + [
        RateRow(shipment_type="Pacchi", tariff_type="Express", weight_min=3.01, weight_max=5, price=Decimal("6.52"))
    ]
    import_rate_lists(db, client=client)

    db.refresh(model)
    assert model.active is False
    assert db.query(TravelBoxRateRow).count() == 2
    db.close()


def test_rate_list_markups_standard_client_and_fallback():
    db = _session()
    client = FakeClient()
    import_rate_lists(db, client=client)
    reseller = _user(db, "reseller", "cliente@test.it")
    admin = _user(db, "admin", "admin@test.it")

    set_rate_list_markups(db, None, [{"list_id": "100", "type": "percent", "value": 10}])
    assert effective_rate_markup(db, reseller, "100", "brt") == ("percent", 10.0)
    assert effective_rate_markup(db, None, "100", "brt") == ("percent", 10.0)

    set_rate_list_markups(db, reseller.id, [{"list_id": "100", "type": "fixed", "value": 2.5}])
    assert effective_rate_markup(db, reseller, "100", "brt") == ("fixed", 2.5)
    assert effective_rate_markup(db, None, "100", "brt") == ("percent", 10.0)
    assert effective_rate_markup(db, admin, "100", "brt") == ("percent", 0.0)

    set_rate_list_markups(db, None, [])
    db.add(MarkupRule(client_id=None, courier="brt", type="percent", value=5))
    db.commit()
    assert effective_rate_markup(db, None, "100", "brt") == ("percent", 5.0)
    assert effective_rate_markup(db, reseller, "100", "brt") == ("fixed", 2.5)
    db.close()


def test_quote_filters_inactive_lists_and_applies_list_markup():
    db = _session()
    reseller = _user(db, "reseller", "cliente@test.it")
    admin = _user(db, "admin", "admin@test.it")
    db.add_all(
        [
            TravelBoxRateList(id="A", name="Attivo", carrier="BRT", active=True),
            TravelBoxRateList(id="B", name="Spento", carrier="BRT", active=False),
        ]
    )
    db.commit()
    set_rate_list_markups(db, None, [{"list_id": "A", "type": "percent", "value": 20}])

    def offer(list_id: str, total: str = "10.00") -> Offer:
        return Offer(
            id="offer-" + list_id,
            carrier="BRT",
            list_id=list_id,
            price=Money(amount=Decimal(total)),
            net_price=Money(amount=Decimal("8.20")),
            tax=Money(amount=Decimal("1.80")),
        )

    result = SimpleNamespace(offers=[offer("A"), offer("B")], message=None)
    req = QuoteRequest(origin_cap="90043", dest_cap="02100", weight_kg=5, length_cm=30, width_cm=20, height_cm=10)
    sender = {"name": "Mittente", "street": "Via Roma", "province": "PA", "email": "a@b.it"}

    client_quote = _build_quotes(result, sender, req, reseller, db)
    assert len(client_quote.quotes) == 1
    assert client_quote.quotes[0].courier == "brt"
    assert client_quote.quotes[0].markup == 2.0
    assert client_quote.quotes[0].price == 12.0

    admin_quote = _build_quotes(result, sender, req, admin, db)
    assert admin_quote.quotes[0].markup == 0.0
    assert admin_quote.quotes[0].price == 10.0

    lists = list_rate_lists(db, reseller.id)
    assert {row.id: row.active for row in lists} == {"A": True, "B": False}
    db.close()
