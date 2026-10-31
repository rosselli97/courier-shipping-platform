from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from travelbox.models import CreateShipmentResult, Money, Offer
from travelbox.models import Shipment as TravelBoxShipment

from app.database import Base
from app.models import User
from app.schemas import TravelBoxCheckoutRequest
from app.serializers import shipment_out
from app.shipments import advance_tracking, is_travelbox_shipment, record_travelbox_shipment


def _result(reference: str = "TBC-40123") -> CreateShipmentResult:
    offer = Offer(
        id="214424",
        carrier="POSTE DELIVERY BUSINESS EXPRESS 1",
        price=Money(amount=Decimal("8.86")),
        net_price=Money(amount=Decimal("7.26")),
        tax=Money(amount=Decimal("1.60")),
        weight_kg=20.0,
    )
    remote = TravelBoxShipment(
        id="40123",
        reference=reference,
        status="IN CARRELLO",
        carrier="POSTE DELIVERY BUSINESS EXPRESS 1",
        price=Money(amount=Decimal("8.86")),
    )
    return CreateShipmentResult(
        status="submitted",
        message="Spedizione aggiunta al carrello",
        offer=offer,
        shipment=remote,
    )


def _body() -> TravelBoxCheckoutRequest:
    return TravelBoxCheckoutRequest(
        origin_cap="90043",
        dest_cap="02100",
        weight_kg=20,
        length_cm=40,
        width_cm=40,
        height_cm=40,
        pieces=1,
        offer_id="214424",
        recipient_name="Bonura Rossella",
        recipient_address="VIALE EUGENIO DUPRE THESEIDER 27",
        recipient_email="cliente@example.com",
    )


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    user = User(
        email="admin@test.it",
        password_hash="x",
        role="admin",
        company_name="MUVPACK Test",
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return db, user


def test_record_travelbox_shipment_appears_in_local_list():
    db, user = _session()
    shipment = record_travelbox_shipment(db, user, _body(), _result())
    assert shipment is not None
    assert shipment.tracking_code == "TBC-40123"
    assert shipment.owner_id == user.id
    assert shipment.is_admin_shipment is True
    assert shipment.courier == "poste"
    assert shipment.price == 8.86
    assert shipment.status == "creata"
    assert is_travelbox_shipment(shipment)
    assert shipment_out(shipment).source == "travelbox"
    assert len(shipment.events) == 1
    assert "TravelBox" in shipment.events[0].description
    db.close()


def test_record_travelbox_shipment_is_idempotent_and_skips_fake_tracking():
    db, user = _session()
    first = record_travelbox_shipment(db, user, _body(), _result())
    second = record_travelbox_shipment(db, user, _body(), _result())
    assert first is not None and second is not None
    assert first.id == second.id
    before = len(second.events)
    advance_tracking(db, second)
    assert len(second.events) == before
    db.close()
