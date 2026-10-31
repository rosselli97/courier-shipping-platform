import pytest
from pydantic import ValidationError

from app.pricing import billable_weight
from app.schemas import QuoteRequest


def _req(**overrides) -> QuoteRequest:
    data = {
        "origin_cap": "90043",
        "dest_cap": "02100",
        "weight_kg": 20,
        "length_cm": 40,
        "width_cm": 40,
        "height_cm": 40,
    }
    data.update(overrides)
    return QuoteRequest(**data)


def test_pieces_default_and_validation():
    assert _req().pieces == 1
    with pytest.raises(ValidationError):
        _req(pieces=0)


def test_billable_weight_multiplies_volumetric_by_pieces():
    assert billable_weight(_req(pieces=1)) == (20.0, 12.8)
    assert billable_weight(_req(pieces=2)) == (25.6, 25.6)
