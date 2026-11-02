from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from travelbox.models import CreateShipmentResult, Money, Offer, Package, Party
from travelbox.models import Shipment as TravelBoxShipment

from app.database import Base
from app.models import MarkupRule, User
from app.schemas import TravelBoxCheckoutRequest
from app.serializers import shipment_out
from app.shipments import (
    advance_tracking,
    is_travelbox_shipment,
    record_travelbox_history,
    record_travelbox_shipment,
    travelbox_status_importable,
)


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
    db.add(MarkupRule(client_id=None, courier="poste", type="percent", value=0))
    db.commit()
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


def test_status_importable_skips_annulled():
    assert travelbox_status_importable("CONSEGNATA") is True
    assert travelbox_status_importable("IN TRANSITO") is True
    assert travelbox_status_importable("ANNULLATA") is False
    assert travelbox_status_importable("RIFIUTATA") is False


def test_record_travelbox_history_maps_detail_and_is_idempotent():
    db, user = _session()
    remote = TravelBoxShipment(
        id="40000",
        reference="TBC-40000",
        status="CONSEGNATA",
        created_at="01/02/2026 10:30",
        price=Money(amount=Decimal("12.50")),
        sender=Party(name="Mario Rossi"),
    )
    detail = TravelBoxShipment(
        id="40000",
        reference="TBC-40000",
        status="CONSEGNATA",
        created_at="01/02/2026 10:30:00",
        carrier="BRT FERMOPOINT",
        service="Pacchi",
        sender=Party(
            name="Mario Rossi",
            street="Via A 1",
            city="Roma",
            province="RM",
            postal_code="00100",
        ),
        recipient=Party(
            name="Anna Bianchi",
            street="Via B 2",
            city="Milano",
            province="MI",
            postal_code="20100",
            email="anna@example.com",
        ),
        packages=[
            Package(
                pieces=1,
                weight_kg=10,
                width_cm=30,
                height_cm=20,
                length_cm=40,
            )
        ],
        chargeable_weight_kg=10.0,
        price=Money(amount=Decimal("12.50")),
    )
    shipment = record_travelbox_history(db, user, remote, detail)
    assert shipment is not None
    assert shipment.tracking_code == "TBC-40000"
    assert shipment.courier == "brt"
    assert shipment.origin_cap == "00100"
    assert shipment.origin_city == "Roma"
    assert shipment.dest_cap == "20100"
    assert shipment.dest_city == "Milano"
    assert shipment.recipient_name == "Anna Bianchi"
    assert shipment.status == "consegnata"
    assert shipment.price == 12.50
    assert shipment.billable_weight_kg == 10.0
    assert shipment.created_at.year == 2026
    assert len(shipment.events) == 1
    assert "Importata da TravelBox" in shipment.events[0].description
    assert record_travelbox_history(db, user, remote, detail) is None
    db.close()
