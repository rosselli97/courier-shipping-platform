"""Connettore non ufficiale per il portale TravelBox Contorno."""

from .client import (
    AuthError,
    NoOffers,
    NotFound,
    TravelBoxClient,
    TravelBoxError,
    UpstreamError,
    WriteNotAvailable,
)

__all__ = [
    "TravelBoxClient",
    "TravelBoxError",
    "AuthError",
    "NoOffers",
    "NotFound",
    "UpstreamError",
    "WriteNotAvailable",
]
__version__ = "0.2.0"
