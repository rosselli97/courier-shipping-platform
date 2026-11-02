"""Import e gestione dei listini TravelBox.

I listini del portale sono composti da un'intestazione (nome, corriere,
validita') e da una tabella di fasce (peso/volume/prezzo). Vengono salvati in
locale per poterli mostrare nell'area admin e per applicare il ricarico per
listino ai preventivi e alle spedizioni.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from travelbox.api import get_client

from .models import RateListMarkup, TravelBoxRateList, TravelBoxRateRow, User
from .pricing import rate_list_markups, standard_rate_list_markups
from .schemas import (
    RateListDetailOut,
    RateListOut,
    RateListRowOut,
    RateMarkupRule,
)
from .travelbox_quotes import client_lock

logger = logging.getLogger("muvpack.travelbox.rate_lists")


def import_rate_lists(db: Session, client=None) -> dict:
    """Scarica tutti i listini (intestazioni + fasce) e li salva/aggiorna.

    Le impostazioni locali (attivo/disattivo) restano invariate per i listini
    gia' presenti; le fasce vengono sostituite con quelle appena lette.
    """
    client = client or get_client()
    with client_lock:
        lists = client.rate_lists()

    now = datetime.now(timezone.utc)
    total_rows = 0
    failed = 0

    for remote in lists:
        list_id = str(remote.id or "").strip()
        if not list_id:
            continue

        rows = []
        rows_ok = True
        try:
            with client_lock:
                if (remote.type or "").upper() in ("EXPORT", "IMPORT"):
                    rows = client.rate_list_matrix(list_id)
                else:
                    rows = client.rate_list_details(list_id)
                    if not rows:
                        rows = client.rate_list_matrix(list_id)
        except Exception:
            rows_ok = False
            failed += 1
            logger.exception("Listino %s: fasce non disponibili", list_id)

        model = db.get(TravelBoxRateList, list_id)
        if model is None:
            model = TravelBoxRateList(id=list_id, active=True)
            db.add(model)

        model.name = remote.name or ""
        model.type = remote.type or ""
        model.carrier = remote.carrier or ""
        model.owner = remote.owner or ""
        model.valid_from = remote.valid_from or ""
        model.valid_to = remote.valid_to or ""
        model.cloned_from = remote.cloned_from or ""
        model.imported_at = now

        if not rows_ok:
            continue
        db.execute(delete(TravelBoxRateRow).where(TravelBoxRateRow.list_id == list_id))
        for row in rows:
            db.add(
                TravelBoxRateRow(
                    list_id=list_id,
                    shipment_type=row.shipment_type or "",
                    tariff_type=row.tariff_type or "",
                    weight_min=float(row.weight_min or 0),
                    weight_max=float(row.weight_max or 0),
                    volume_min=float(row.volume_min or 0),
                    volume_max=float(row.volume_max or 0),
                    price=float(row.price or 0),
                    currency=row.currency or "EUR",
                    notes=row.notes or "",
                )
            )
        total_rows += len(rows)

    db.commit()
    return {
        "lists": len(lists),
        "rows": total_rows,
        "failed": failed,
        "imported_at": now,
    }


def _markup_out(value: tuple[str, float] | None) -> RateMarkupRule | None:
    if value is None:
        return None
    return RateMarkupRule(type=value[0], value=value[1])  # type: ignore[arg-type]


def _list_out(
    model: TravelBoxRateList,
    standard: dict[str, tuple[str, float]],
    client_rules: dict[str, tuple[str, float]],
    row_count: int,
) -> RateListOut:
    return RateListOut(
        id=model.id,
        name=model.name or "",
        type=model.type or "",
        carrier=model.carrier or "",
        owner=model.owner or "",
        valid_from=model.valid_from or "",
        valid_to=model.valid_to or "",
        cloned_from=model.cloned_from or "",
        active=bool(model.active),
        imported_at=model.imported_at,
        row_count=row_count,
        standard_markup=_markup_out(standard.get(model.id)),
        client_markup=_markup_out(client_rules.get(model.id)),
    )


def list_rate_lists(db: Session, client_id: str | None = None) -> list[RateListOut]:
    models = list(
        db.scalars(
            select(TravelBoxRateList)
            .options(selectinload(TravelBoxRateList.rows))
            .order_by(TravelBoxRateList.name, TravelBoxRateList.id)
        )
    )
    standard = standard_rate_list_markups(db)
    client_rules = rate_list_markups(db, client_id) if client_id else {}
    return [_list_out(model, standard, client_rules, len(model.rows)) for model in models]


def rate_list_detail(db: Session, list_id: str) -> RateListDetailOut | None:
    model = db.get(TravelBoxRateList, list_id)
    if model is None:
        return None
    rows = list(
        db.scalars(
            select(TravelBoxRateRow)
            .where(TravelBoxRateRow.list_id == list_id)
            .order_by(
                TravelBoxRateRow.shipment_type,
                TravelBoxRateRow.weight_min,
                TravelBoxRateRow.weight_max,
                TravelBoxRateRow.price,
            )
        )
    )
    base = _list_out(model, standard_rate_list_markups(db), {}, len(rows))
    return RateListDetailOut(
        **base.model_dump(),
        rows=[
            RateListRowOut(
                shipment_type=row.shipment_type or "",
                tariff_type=row.tariff_type or "",
                weight_min=row.weight_min or 0,
                weight_max=row.weight_max or 0,
                volume_min=row.volume_min or 0,
                volume_max=row.volume_max or 0,
                price=row.price or 0,
                currency=row.currency or "EUR",
                notes=row.notes or "",
            )
            for row in rows
        ],
    )


def set_rate_list_active(db: Session, list_id: str, active: bool) -> RateListOut | None:
    model = db.get(TravelBoxRateList, list_id)
    if model is None:
        return None
    model.active = active
    db.commit()
    db.refresh(model)
    return _list_out(model, standard_rate_list_markups(db), {}, len(model.rows))


def set_rate_list_markups(
    db: Session,
    client_id: str | None,
    rules: list[dict],
) -> list[RateListOut]:
    if client_id:
        client = db.get(User, client_id)
        if client is None or client.role != "reseller":
            raise ValueError("Cliente non trovato")
    for rule in rules:
        if db.get(TravelBoxRateList, rule["list_id"]) is None:
            raise ValueError("Listino non trovato: " + str(rule["list_id"]))
    seen: set[str] = set()
    for rule in rules:
        if rule["list_id"] in seen:
            raise ValueError("Ricarico duplicato per il listino " + str(rule["list_id"]))
        seen.add(rule["list_id"])

    condition = (
        RateListMarkup.client_id.is_(None)
        if client_id is None
        else RateListMarkup.client_id == client_id
    )
    db.execute(delete(RateListMarkup).where(condition))
    for rule in rules:
        db.add(
            RateListMarkup(
                client_id=client_id,
                list_id=rule["list_id"],
                type=rule["type"],
                value=rule["value"],
            )
        )
    db.commit()
    return list_rate_lists(db, client_id)
