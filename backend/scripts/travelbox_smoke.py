#!/usr/bin/env python
"""Smoke test live: login + liste + dettaglio + etichetta + carrello + preventivo.

    .venv/bin/python scripts/smoke.py

Esegue solo letture e un preventivo (nessuna spedizione, nessun pagamento).
Il portale mostra le spedizioni solo se si passa un intervallo di date.
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from travelbox.client import NoOffers, TravelBoxClient  # noqa: E402
from travelbox.config import Settings  # noqa: E402
from travelbox.models import Package, ShipmentDraft  # noqa: E402


def section(title: str) -> None:
    print(f"\n== {title} ==")


def main() -> int:
    settings = Settings()
    if not settings.userid or not settings.password:
        print("Mancano TRAVELBOX_USERID / TRAVELBOX_PASSWORD in .env", file=sys.stderr)
        return 2

    with TravelBoxClient(settings) as tb:
        section("login")
        payload = tb.login()
        print("success:", payload.get("success"), "| redirect:", payload.get("redirect"))

        section("health")
        print(tb.health().model_dump_json(indent=2))

        section("listini")
        rates = tb.rate_lists()
        print(f"totale: {len(rates)}")
        for r in rates[:3]:
            print(" -", r.id, r.name, "|", r.type, "|", r.carrier)

        section("fatture")
        invoices = tb.invoices()
        print(f"totale: {len(invoices)}")
        for i in invoices[:3]:
            print(" -", i.number, i.date, i.customer, i.amount.amount if i.amount else None, i.pdf_url)

        section("rubrica mittenti/destinatari")
        entries = tb.address_book()
        print(f"totale: {len(entries)}")
        for e in entries[:3]:
            print(" -", e.party.name, "|", e.party.city, e.party.province, "|", e.kind)

        section("spedizioni (anno corrente)")
        shipments = tb.shipments(
            page=1,
            data_dal=f"{date.today().year}-01-01",
            data_al=f"{date.today().year}-12-31",
        )
        print(f"pagina 1: {len(shipments)} righe")
        if shipments:
            print(json.dumps(shipments[0].model_dump(mode="json", exclude={"raw"}), indent=2, ensure_ascii=False))

        section("dettaglio + etichetta")
        if shipments:
            detail = tb.shipment_detail(shipments[0].id or "")
            print(
                json.dumps(
                    detail.model_dump(mode="json", exclude={"raw", "sender", "recipient"}),
                    indent=2,
                    ensure_ascii=False,
                )
            )
            if detail.sender:
                print("mittente:", detail.sender.name, detail.sender.city, detail.sender.postal_code)
            if detail.recipient:
                print("destinatario:", detail.recipient.name, detail.recipient.city, detail.recipient.postal_code)
            if detail.label_token:
                label = tb.download_label(detail.label_token)
                print(
                    "etichetta:",
                    label.content_type,
                    label.size,
                    "bytes",
                    "| magic:",
                    label.content[:5],
                )
            else:
                print("nessun token etichetta nel dettaglio")

        section("gruppi etichette")
        for group in tb.label_groups():
            print(" -", group.id, group.name)

        section("carrello")
        for item in tb.cart():
            print(" -", item.id, item.reference, item.price.amount if item.price else None, item.status)

        section("preventivo (nessuna scrittura)")
        draft = ShipmentDraft(
            sender_id="13562",
            recipient_id="13563",
            sender_city="Camporeale",
            sender_cap="90043",
            sender_province="PA",
            recipient_city="Rieti",
            recipient_cap="02100",
            recipient_province="RI",
            packages=[
                Package(pieces=1, weight_kg=20, width_cm=40, height_cm=40, length_cm=40)
            ],
        )
        try:
            result = tb.quote(draft)
            print(f"offerte: {len(result.offers)} | messaggio: {result.message}")
            for offer in result.offers[:5]:
                print(
                    " -",
                    offer.id,
                    offer.carrier,
                    offer.price.amount if offer.price else None,
                    offer.book_url[:40] if offer.book_url else None,
                )
        except NoOffers as exc:
            print("nessuna offerta:", exc)

        section("preview creazione (nessuna scrittura)")
        try:
            preview = tb.create_shipment(draft, confirm=False)
            print("stato:", preview.status, "|", preview.message)
            if preview.offer:
                print("offerta:", preview.offer.carrier, preview.offer.price.amount if preview.offer.price else None)
        except NoOffers as exc:
            print("nessuna offerta, nessuna scrittura:", exc)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
