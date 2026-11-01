from __future__ import annotations

import hmac
import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from travelbox.api import app as travelbox_app

from .config import CORS_ORIGIN_REGEX, CORS_ORIGINS, SESSION_COOKIE
from .database import Base, SessionLocal, engine
from .models import User
from .routers import admin, auth, contacts, geo, payments, quotes, reseller, tickets, tracking, travelbox_checkout
from .security import read_session_token
from .seed import seed

logger = logging.getLogger("muvpack")


def apply_migrations() -> None:
    """Aggiunge colonne nuove ai database gia' esistenti (Render Postgres)."""
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    if "shipments" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("shipments")}
    if "label_token" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE shipments ADD COLUMN label_token VARCHAR(255)"))


def init_database(attempts: int = 30) -> None:
    for attempt in range(1, attempts + 1):
        try:
            Base.metadata.create_all(bind=engine)
            apply_migrations()
            seed()
            return
        except Exception:
            if attempt == attempts:
                raise
            logger.exception("Database not ready (attempt %s/%s), retrying in 2s", attempt, attempts)
            time.sleep(2)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    yield


app = FastAPI(title="MUVPACK API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(geo.router, prefix="/api")
app.include_router(quotes.router, prefix="/api")
app.include_router(tracking.router, prefix="/api")
app.include_router(contacts.router, prefix="/api")
app.include_router(reseller.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(payments.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")
app.include_router(travelbox_checkout.router, prefix="/api")


@app.middleware("http")
async def travelbox_guard(request: Request, call_next):
    if not request.url.path.startswith("/api/travelbox") or request.method == "OPTIONS":
        return await call_next(request)

    is_checkout = request.url.path == "/api/travelbox/checkout"
    allowed = False
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        user_id = read_session_token(token)
        if user_id:
            db = SessionLocal()
            try:
                user = db.get(User, user_id)
                if user is not None:
                    allowed = user.role == "admin" or (
                        is_checkout and user.role == "reseller" and user.status == "active"
                    )
            finally:
                db.close()

    if not allowed:
        expected = os.getenv("TRAVELBOX_API_KEY", "")
        provided = request.headers.get("X-TravelBox-Key", "")
        if expected and provided and hmac.compare_digest(expected.encode(), provided.encode()):
            allowed = True

    if not allowed:
        return JSONResponse(status_code=403, content={"detail": "Accesso riservato all'amministrazione"})
    return await call_next(request)


app.mount("/api/travelbox", travelbox_app)


@app.get("/api/health")
def health():
    return {"ok": True}
