"""Configurazione via variabili d'ambiente / file .env locale."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    base_url: str = os.getenv("TRAVELBOX_BASE_URL", "https://www.travelboxcontorno.it")
    userid: str = os.getenv("TRAVELBOX_USERID", "")
    password: str = os.getenv("TRAVELBOX_PASSWORD", "")
    session_file: Path = Path(os.getenv("TRAVELBOX_SESSION_FILE", str(ROOT / ".session.json")))
    timeout: float = float(os.getenv("TRAVELBOX_TIMEOUT", "30"))
    # Pausa minima tra due richieste: il portale non e' nostro, non va martellato.
    min_interval: float = float(os.getenv("TRAVELBOX_MIN_INTERVAL", "0.8"))
    cache_ttl: int = int(os.getenv("TRAVELBOX_CACHE_TTL", "300"))

    def require_credentials(self) -> None:
        if not self.userid or not self.password:
            raise RuntimeError(
                "Credenziali mancanti: imposta TRAVELBOX_USERID e TRAVELBOX_PASSWORD in .env"
            )
