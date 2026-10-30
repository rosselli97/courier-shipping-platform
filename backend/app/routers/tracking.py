from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Shipment
from ..pricing import COURIERS
from ..schemas import TrackingEventOut, TrackingResponse
from ..serializers import iso
from ..shipments import advance_tracking

router = APIRouter(tags=["tracking"])


@router.get("/tracking/{code}", response_model=TrackingResponse)
def tracking(code: str, db: Session = Depends(get_db)):
    shipment = db.scalar(select(Shipment).where(Shipment.tracking_code == code.strip().upper()))
    if shipment is None:
        raise HTTPException(status_code=404, detail="Spedizione non trovata")
    shipment = advance_tracking(db, shipment)
    return TrackingResponse(
        tracking_code=shipment.tracking_code,
        courier=shipment.courier,  # type: ignore[arg-type]
        courier_name=COURIERS[shipment.courier]["name"],
        origin_city=shipment.origin_city,
        dest_city=shipment.dest_city,
        status=shipment.status,  # type: ignore[arg-type]
        created_at=iso(shipment.created_at),
        events=[
            TrackingEventOut(
                status=event.status,  # type: ignore[arg-type]
                description=event.description,
                location=event.location,
                timestamp=iso(event.timestamp),
            )
            for event in shipment.events
        ],
    )
