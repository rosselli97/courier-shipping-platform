"""Estrazione: da HTML/JSON del portale ai modelli canonici.

Il portale restituisce frammenti HTML (non JSON) per la maggior parte delle
liste. I parser qui sotto lavorano sulle etichette delle colonne, non sugli
indici, cosi' resistono meglio a colonne aggiunte o riordinate.
"""

from __future__ import annotations

import base64
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional
from urllib.parse import parse_qsl

from bs4 import BeautifulSoup, Tag

from . import mapping
from .models import (
    AddressBookEntry,
    Invoice,
    LabelGroup,
    Money,
    Offer,
    Package,
    Party,
    Quote,
    RateList,
    Shipment,
)

_TABLE_ROWS = re.compile(r"^/?(apripratica|dettaglio|tracking|stampafattura|scaricafile)/", re.I)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def clean(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def parse_money(value: str | None) -> Optional[Money]:
    """'€ 1.234,56' -> Money(amount=1234.56, currency='EUR')."""
    if not value:
        return None
    text = clean(value)
    currency = "EUR"
    if "$" in text or "USD" in text.upper():
        currency = "USD"
    elif "£" in text or "GBP" in text.upper():
        currency = "GBP"

    number = re.sub(r"[^\d,.\-]", "", text)
    if not number:
        return None
    # Formato italiano: punto = migliaia, virgola = decimali.
    if "," in number:
        number = number.replace(".", "").replace(",", ".")
    try:
        amount = Decimal(number)
    except InvalidOperation:
        return None
    return Money(amount=amount, currency=currency, formatted=text)


def to_float(value: str | None) -> Optional[float]:
    """Numero del portale, che usa sia la virgola sia il punto decimale.

    Le spedizioni storiche mostrano "20,00 kg"; quelle create dal form
    mostrano "20.000 kg" e "40.00 cm". Quindi il punto, da solo, e' decimale;
    la rimozione delle migliaia si applica solo quando ci sono entrambi i
    separatori ("1.234,56").
    """
    if not value:
        return None
    text = value.strip().replace(" ", "")
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def decode_token(token: str | None) -> dict[str, str]:
    """I token del portale sono base64 di query string.

    Esempio: `aWRzcGVkaXppb25lPTMzNjgy` -> {"idspedizione": "33682"}.
    """
    if not token:
        return {}
    padded = token + "=" * (-len(token) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode()).decode("utf-8", "replace")
    except (ValueError, UnicodeDecodeError):
        return {}
    return dict(parse_qsl(raw, keep_blank_values=True))


def encode_shipment_token(shipment_id: str | int) -> str:
    raw = f"idspedizione={shipment_id}".encode()
    return base64.b64encode(raw).decode()


def extract_csrf(html: str) -> Optional[str]:
    soup = BeautifulSoup(html, "html.parser")
    field = soup.find("input", {"name": "csrf_token"})
    if isinstance(field, Tag) and field.get("value"):
        return str(field["value"])
    return None


# ---------------------------------------------------------------------------
# Tabelle
# ---------------------------------------------------------------------------


def parse_table(html: str, table_id: str | None = None) -> tuple[list[str], list[dict[str, Any]]]:
    """Ritorna (headers, righe).

    Ogni riga: {"data": {header: valore}, "cells": [...], "html": "...", "links": [...]}
    Le righe di totale (colspan) vengono tenute solo in `cells`/`html`, senza
    `data`, per non sporcare il mapping.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id=table_id) if table_id else soup.find("table")
    if not isinstance(table, Tag):
        return [], []

    thead = table.find("thead")
    headers = [clean(th.get_text(" ")) for th in thead.find_all("th")] if isinstance(thead, Tag) else []

    body = table.find("tbody") or table
    rows: list[dict[str, Any]] = []
    for tr in body.find_all("tr"):
        cells = tr.find_all("td", recursive=False)
        if not cells:
            continue
        values = [clean(td.get_text(" ")) for td in cells]
        links = [str(a.get("href")) for a in tr.find_all("a", href=True)]
        row: dict[str, Any] = {"cells": values, "html": str(tr), "links": links}
        if headers and len(headers) == len(values) and not any(td.get("colspan") for td in cells):
            row["data"] = dict(zip(headers, values))
        rows.append(row)
    return headers, rows


def _detail_link(links: list[str]) -> Optional[str]:
    for href in links:
        if re.search(r"/apripratica/\d+", href):
            return href
    return None


def _tracking_url(row_html: str) -> Optional[str]:
    # onclick="trackingSpedizione('https://...')" oppure href con tracking.
    match = re.search(r"trackingSpedizione\(\s*['\"]([^'\"]+)['\"]", row_html)
    if match:
        return match.group(1)
    match = re.search(r"href=['\"](https?://[^'\"]*(?:track|spedizion)[^'\"]*)", row_html, re.I)
    return match.group(1) if match else None


def _tracking_number(url: str | None) -> Optional[str]:
    if not url:
        return None
    clean_url = url.split("?")[0].rstrip("/")
    return clean_url.rsplit("/", 1)[-1] or None


def parse_shipments(html: str) -> list[Shipment]:
    """Lista da `/lemiespedizioni_filter`.

    La tabella usa icone/base64 per corriere e servizi, quindi quei due campi
    restano vuoti nella lista e vengono completati dal dettaglio. Id, token,
    tracking e token etichetta sono invece presenti negli attributi/onclick.
    """
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id="tabellaspedizioni") or soup.find("table")
    if not isinstance(table, Tag):
        return []

    out: list[Shipment] = []
    for tr in table.find_all("tr"):
        checkbox = tr.find("input", attrs={"data-idspedizione": True})
        if not isinstance(checkbox, Tag):
            continue
        cells = [clean(td.get_text(" ")) for td in tr.find_all("td")]
        if len(cells) < 7:
            continue

        row_html = str(tr)
        shipment_id = str(checkbox.get("data-idspedizione") or "") or None
        date_text = cells[1]
        created_match = re.search(r"\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}", date_text)
        reference_match = re.search(r"TBC-\d+", date_text)
        payment_match = re.search(r"Pagamento\s+[A-Za-z ]+", date_text)

        detail_token = None
        detail_match = re.search(r"/vedispedizione/([A-Za-z0-9+/=]+)", row_html)
        if detail_match:
            detail_token = detail_match.group(1)
        else:
            apri = re.search(r"apriPratica\('([^']+)'\)", row_html)
            detail_token = apri.group(1) if apri else None

        if not shipment_id:
            shipment_id = decode_token(detail_token).get("idspedizione")

        label_match = re.search(r"stampaEtichetta\('([^']+)'\)", row_html)
        tracking_url = _tracking_url(row_html)

        parties = cells[4]
        sender_name = parties.split("→")[0].strip() if "→" in parties else parties.strip()

        out.append(
            Shipment(
                id=shipment_id,
                reference=reference_match.group(0) if reference_match else None,
                created_at=created_match.group(0) if created_match else None,
                status=cells[6] or None,
                price=parse_money(cells[5]),
                payment_method=clean(payment_match.group(0)) if payment_match else None,
                tracking_url=tracking_url,
                tracking_number=_tracking_number(tracking_url),
                detail_url=f"/vedispedizione/{detail_token}" if detail_token else None,
                label_token=label_match.group(1) if label_match else None,
                sender=Party(name=sender_name) if sender_name else None,
                fetched_at=_now(),
                raw={"cells": cells, "detail_token": detail_token},
            )
        )
    return out


def parse_quotes(html: str) -> list[Quote]:
    _, rows = parse_table(html)
    out: list[Quote] = []
    for row in rows:
        data = row.get("data")
        if not data:
            continue
        out.append(
            Quote(
                created_at=mapping.pick(data, mapping.QUOTE_ALIASES["created_at"]),
                carrier=mapping.pick(data, mapping.QUOTE_ALIASES["carrier"]),
                parties=mapping.pick(data, mapping.QUOTE_ALIASES["parties"]),
                status=mapping.pick(data, mapping.QUOTE_ALIASES["status"]),
                price=parse_money(mapping.pick(data, mapping.QUOTE_ALIASES["price"])),
                fetched_at=_now(),
                raw=data,
            )
        )
    return out


def parse_invoices(html: str) -> list[Invoice]:
    _, rows = parse_table(html)
    out: list[Invoice] = []
    for row in rows:
        data = row.get("data")
        if not data:
            continue
        number = mapping.pick(data, mapping.INVOICE_ALIASES["number"])
        if not number:
            continue
        pdf_url = next((l for l in row.get("links", []) if "/stampafattura/" in l), None)
        out.append(
            Invoice(
                number=number,
                date=mapping.pick(data, mapping.INVOICE_ALIASES["date"]),
                customer=mapping.pick(data, mapping.INVOICE_ALIASES["customer"]),
                amount=parse_money(mapping.pick(data, mapping.INVOICE_ALIASES["amount"])),
                pdf_url=pdf_url,
                fetched_at=_now(),
                raw=data,
            )
        )
    return out


def parse_rate_lists(html: str) -> list[RateList]:
    """I listini hanno celle con id tipo `nome_38879` / `corriere_38879`."""
    soup = BeautifulSoup(html, "html.parser")
    out: list[RateList] = []
    for tr in soup.find_all("tr"):
        values: dict[str, str] = {}
        list_id: Optional[str] = None
        for td in tr.find_all("td"):
            td_id = str(td.get("id") or "")
            match = re.match(r"([a-z_]+)_(\d+)$", td_id)
            if not match:
                continue
            values[match.group(1)] = clean(td.get_text(" "))
            list_id = match.group(2)
        if list_id:
            out.append(
                RateList(
                    id=list_id,
                    name=mapping.pick(values, mapping.RATE_LIST_ALIASES["name"]),
                    type=mapping.pick(values, mapping.RATE_LIST_ALIASES["type"]),
                    owner=mapping.pick(values, mapping.RATE_LIST_ALIASES["owner"]),
                    valid_from=mapping.pick(values, mapping.RATE_LIST_ALIASES["valid_from"]),
                    valid_to=mapping.pick(values, mapping.RATE_LIST_ALIASES["valid_to"]),
                    cloned_from=mapping.pick(values, mapping.RATE_LIST_ALIASES["cloned_from"]),
                    carrier=mapping.pick(values, mapping.RATE_LIST_ALIASES["carrier"]),
                    fetched_at=_now(),
                )
            )
    return out


def parse_address_book(payload: str | dict[str, Any]) -> list[AddressBookEntry]:
    """`/mittentidestinatarilist` risponde {"success": true, "html": "<tr>..."}."""
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return []
    if not isinstance(payload, dict) or not payload.get("html"):
        return []

    soup = BeautifulSoup(str(payload["html"]), "html.parser")
    out: list[AddressBookEntry] = []
    for tr in soup.find_all("tr"):
        cells = [clean(td.get_text(" ")) for td in tr.find_all("td")]
        if len(cells) < 7:
            continue
        # Ordine documentato dagli header della pagina:
        # Cognome/Nome, Indirizzo, Citta, CAP, Provincia, Nazione, Telefono, Tipo
        kind = cells[7] if len(cells) > 7 else None
        party = Party(
            name=cells[0],
            street=cells[1],
            city=cells[2],
            postal_code=cells[3],
            province=cells[4],
            country=cells[5],
            phone=cells[6],
            kind=kind,
        )
        entry_id = None
        edit = re.search(r"editItem\('([^']+)'\)", str(tr))
        if edit:
            entry_id = edit.group(1)
        out.append(AddressBookEntry(id=entry_id, party=party, kind=kind))
    return out


def _party_from_inputs(soup: BeautifulSoup, prefix: str) -> dict[str, str]:
    data: dict[str, str] = {}
    for element in soup.find_all(["input", "select", "textarea"]):
        name = str(element.get("name") or "")
        if not name.startswith(f"{prefix}[") or not name.endswith("]"):
            continue
        key = name[len(prefix) + 1 : -1]
        if element.name == "select":
            option = element.find("option", selected=True) or element.find("option")
            data[key] = clean(option.get_text(" ")) if isinstance(option, Tag) else ""
        else:
            data[key] = clean(str(element.get("value") or ""))
    return data


def _party_country(soup: BeautifulSoup, prefix: str) -> str:
    """Nazione della sezione mittente/destinatario (le due tabelle sono distinte)."""
    field = soup.find("input", {"name": re.compile(rf"^{re.escape(prefix)}\[")})
    table = field.find_parent("table") if isinstance(field, Tag) else None
    scope: Any = table if isinstance(table, Tag) else soup
    return _label_value(scope, "Nazione") or "Italia"


def _label_value(soup: BeautifulSoup, label: str) -> Optional[str]:
    """Valore nella cella accanto a `<span>Etichetta:</span>`."""
    span = soup.find(
        "span",
        string=re.compile(rf"^\s*{re.escape(label)}\s*:?\s*$"),
    )
    if not isinstance(span, Tag):
        return None
    cell = span.find_parent("td")
    sibling = cell.find_next_sibling("td") if isinstance(cell, Tag) else None
    if not isinstance(sibling, Tag):
        return None
    text = clean(sibling.get_text(" "))
    return text or None


def parse_shipment_detail(html: str, shipment_id: str | None = None) -> Shipment:
    """Parser della pagina `/vedispedizione/{token}`.

    Il riepilogo e' testo in span con etichetta (regex in mapping.py);
    mittente/destinatario sono input `mittente[campo]` / `destinatario[campo]`;
    i colli sono righe testuali ripetute.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    text = clean(soup.get_text(" "))

    summary: dict[str, Any] = {}
    for key, pattern in mapping.DETAIL_TEXT_PATTERNS.items():
        match = re.search(pattern, text)
        summary[key] = clean(match.group(1)) if match else None

    sender_data = _party_from_inputs(soup, mapping.DETAIL_INPUT_PREFIXES["sender"])
    recipient_data = _party_from_inputs(soup, mapping.DETAIL_INPUT_PREFIXES["recipient"])

    def party(data: dict[str, str], kind: str, prefix: str) -> Optional[Party]:
        if not data.get("cognomenome") and not data.get("indirizzo"):
            return None
        return Party(
            name=data.get("cognomenome") or None,
            street=data.get("indirizzo") or None,
            city=data.get("localita") or None,
            province=data.get("provincia") or None,
            postal_code=data.get("cap") or None,
            country=_party_country(soup, prefix),
            email=data.get("email") or None,
            phone=data.get("telefono") or data.get("cellulare") or None,
            kind=kind,
        )

    packages: list[Package] = []
    for match in re.finditer(mapping.PACKAGE_PATTERN, text):
        packages.append(
            Package(
                pieces=int(match.group("pieces")),
                weight_kg=to_float(match.group("weight")),
                width_cm=to_float(match.group("width")),
                height_cm=to_float(match.group("height")),
                length_cm=to_float(match.group("length")),
                type=summary.get("service"),
            )
        )

    label_token = None
    label_url = None
    for link in soup.find_all("a", href=True):
        href = str(link.get("href"))
        if "/downloadfile/" in href and "etichett" in clean(link.get_text(" ")).lower():
            label_token = href.rstrip("/").rsplit("/", 1)[-1]
            label_url = href
            break

    raw_fields = {
        "summary": summary,
        "sender": sender_data,
        "recipient": recipient_data,
        "labels": [
            str(a.get("href"))
            for a in soup.find_all("a", href=True)
            if "/downloadfile/" in str(a.get("href"))
        ],
    }

    return Shipment(
        id=shipment_id,
        reference=summary.get("reference"),
        created_at=summary.get("created_at"),
        status=summary.get("status"),
        service=summary.get("service"),
        carrier=summary.get("carrier"),
        tracking_number=summary.get("tracking_number"),
        chargeable_weight_kg=to_float(summary.get("chargeable_weight_kg")),
        pieces=int(summary["total_pieces"]) if summary.get("total_pieces") else None,
        packages=packages,
        price=parse_money(summary.get("price")),
        sender=party(
            sender_data,
            "Mittente",
            mapping.DETAIL_INPUT_PREFIXES["sender"],
        ),
        recipient=party(
            recipient_data,
            "Destinatario",
            mapping.DETAIL_INPUT_PREFIXES["recipient"],
        ),
        pickup_date=summary.get("pickup_date"),
        detail_url=f"/vedispedizione/{shipment_id}" if shipment_id else None,
        label_token=label_token,
        label_url=label_url,
        fetched_at=_now(),
        raw=raw_fields,
    )


def _first_money(value: str | None) -> Optional[Money]:
    """Primo importo in una cella che puo' contenerne due (totale + vendita)."""
    if not value:
        return None
    match = re.search(r"-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?", value)
    return parse_money(match.group(0)) if match else None


def _row_cell(cells: list[Tag], index: int | None) -> Optional[str]:
    if index is None or index >= len(cells):
        return None
    return clean(cells[index].get_text(" "))


def parse_offers(html: str) -> tuple[list[Offer], Optional[str]]:
    """Parser della tabella restituita da `/mostraofferte`.

    Ogni riga offerta ha un link `creaspedizione/{token}`: il token e' base64
    di una query string che contiene `offerta` (JSON con corriere, prezzi,
    idlistino, iddettaglio). La tabella espone Prezzo/Iva/Totale in colonne
    separate; `price` e' il Totale ivato, cioe' quello che il portale addebita.
    """
    soup = BeautifulSoup(html, "html.parser")
    message = None
    if "Nessuna offerta" in html:
        match = re.search(r"Nessuna offerta[^<]*", html)
        message = clean(match.group(0)) if match else "Nessuna offerta disponibile"

    table = next(
        (
            table
            for table in soup.find_all("table")
            if table.find("a", href=re.compile(r"creaspedizione/", re.I))
        ),
        None,
    )
    if not isinstance(table, Tag):
        return [], message

    headers = [clean(th.get_text(" ")) for th in table.find_all("th")]

    def column(label: str, fallback: int | None) -> int | None:
        try:
            return headers.index(label)
        except ValueError:
            return fallback

    carrier_idx = column("Corriere", 0)
    weight_idx = column("Peso tassato", 2)
    price_idx = column("Prezzo", 3)
    tax_idx = column("Iva", 4)
    total_idx = column("Totale", 5)
    currency_idx = column("Valuta", 6)

    offers: list[Offer] = []
    seen: set[str] = set()
    for anchor in table.find_all("a", href=re.compile(r"creaspedizione/", re.I)):
        href = str(anchor.get("href") or "").strip()
        if not href or href in seen:
            continue
        seen.add(href)

        token = href.split("creaspedizione/", 1)[-1]
        token_data = decode_token(token)
        try:
            offer_data = json.loads(token_data.get("offerta") or "{}")
        except (TypeError, json.JSONDecodeError):
            offer_data = {}
        if not isinstance(offer_data, dict):
            offer_data = {}

        tr = anchor.find_parent("tr")
        cells = tr.find_all("td", recursive=False) if isinstance(tr, Tag) else []
        price = _first_money(_row_cell(cells, price_idx))
        tax = _first_money(_row_cell(cells, tax_idx))
        total = _first_money(_row_cell(cells, total_idx))
        if total is None and price is not None:
            total = Money(
                amount=(price.amount or Decimal("0")) + (tax.amount if tax and tax.amount else Decimal("0")),
                currency=price.currency,
            )

        carrier = clean(str(offer_data.get("corriere") or ""))
        if not carrier:
            carrier_cell = cells[carrier_idx] if carrier_idx is not None and carrier_idx < len(cells) else None
            image = carrier_cell.find("img") if isinstance(carrier_cell, Tag) else None
            carrier = clean(str(image.get("alt") or "")) if isinstance(image, Tag) else ""

        notes = str(offer_data.get("notes") or "")
        service = next(
            (clean(line.lstrip("- ").strip()) for line in notes.splitlines() if clean(line.lstrip("- ").strip())),
            carrier or None,
        )

        weight_text = _row_cell(cells, weight_idx)
        weight_match = re.search(r"[\d.,]+", weight_text or "")
        weight = to_float(weight_match.group(0)) if weight_match else None
        if weight is None and offer_data.get("peso") is not None:
            weight = to_float(str(offer_data.get("peso")))

        currency = clean(str(offer_data.get("valuta") or _row_cell(cells, currency_idx) or "EUR"))
        offer_id = str(
            offer_data.get("iddettaglio")
            or token_data.get("iddettaglio")
            or token_data.get("idlistino")
            or ""
        ) or None

        offers.append(
            Offer(
                id=offer_id,
                carrier=carrier or None,
                service=service,
                price=total,
                net_price=price,
                tax=tax,
                currency=currency,
                weight_kg=weight,
                list_id=str(offer_data.get("idlistino") or token_data.get("idlistino") or "") or None,
                detail_id=str(offer_data.get("iddettaglio") or token_data.get("iddettaglio") or "") or None,
                book_url=href,
                submit_url=href,
                submit_method="GET",
                fields={"token": token},
                raw_text=clean(tr.get_text(" "))[:1000] if isinstance(tr, Tag) else None,
            )
        )

    return offers, message


def parse_cart(html: str) -> list[Shipment]:
    """Righe del carrello (`/ilmiocarrello`).

    Il carrello e' l'unico punto in cui una spedizione creata ma non pagata
    compare con stato IN CARRELLO. L'id e' il value della checkbox che il
    portale usa per il checkout.
    """
    soup = BeautifulSoup(html, "html.parser")
    out: list[Shipment] = []
    for tr in soup.find_all("tr"):
        checkbox = tr.find("input", attrs={"name": "spedizioni_da_pagare[]"})
        if not isinstance(checkbox, Tag):
            continue
        cells = tr.find_all("td", recursive=False)
        date_text = _row_cell(cells, 1) or ""
        parties = _row_cell(cells, 3) or ""
        reference_match = re.search(r"TBC-\d+", date_text)
        created_match = re.search(r"\d{2}/\d{2}/\d{4}", date_text)
        sender_name = parties.split("→")[0].strip() if "→" in parties else parties.strip()
        carrier_cell = cells[2] if len(cells) > 2 else None
        image = carrier_cell.find("img") if isinstance(carrier_cell, Tag) else None
        carrier = clean(str(image.get("alt") or "")) if isinstance(image, Tag) else ""

        out.append(
            Shipment(
                id=str(checkbox.get("value") or "") or None,
                reference=reference_match.group(0) if reference_match else None,
                created_at=created_match.group(0) if created_match else None,
                status=_row_cell(cells, 5),
                price=_first_money(_row_cell(cells, 4)),
                carrier=carrier or None,
                sender=Party(name=sender_name) if sender_name else None,
                fetched_at=_now(),
                raw={"cells": [clean(td.get_text(" ")) for td in cells]},
            )
        )
    return out


def parse_booking_form(html: str) -> tuple[Optional[str], dict[str, str]]:
    """Form di conferma della preview `creaspedizione/{token}`.

    Ritorna (action, campi). I radio/checkbox non selezionati sono esclusi:
    il form reale ha `metodo_pagamento=bonifico` preselezionato, quindi il
    chiamante deve sovrascriverlo esplicitamente con `carrello` per non pagare.
    """
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", id="form-spedizione")
    if not isinstance(form, Tag):
        form = next(
            (
                candidate
                for candidate in soup.find_all("form")
                if "inseriscispedizione" in str(candidate.get("action") or "")
            ),
            None,
        )
    if not isinstance(form, Tag):
        return None, {}

    action = str(form.get("action") or "").strip() or "/inseriscispedizione"
    fields: dict[str, str] = {}
    for element in form.find_all(["input", "select", "textarea"]):
        name = str(element.get("name") or "").strip()
        if not name:
            continue
        if element.name == "input":
            input_type = str(element.get("type") or "text").lower()
            if input_type in ("submit", "button", "reset", "file", "image"):
                continue
            if input_type in ("checkbox", "radio") and not element.has_attr("checked"):
                continue
            fields[name] = str(element.get("value") or "")
        elif element.name == "select":
            option = element.find("option", selected=True) or element.find("option")
            fields[name] = str(option.get("value") or "") if isinstance(option, Tag) else ""
        else:
            fields[name] = element.get_text()
    return action, fields


def _control_visible(element: Tag) -> bool:
    node: Tag | None = element
    while isinstance(node, Tag):
        style = str(node.get("style") or "").replace(" ", "").lower()
        if "display:none" in style:
            return False
        classes = node.get("class") or []
        if isinstance(classes, str):
            classes = classes.split()
        if "d-none" in classes:
            return False
        node = node.parent if isinstance(node.parent, Tag) else None
    return True


def describe_booking_form(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    form = soup.find("form", id="form-spedizione")
    if not isinstance(form, Tag):
        form = next(
            (
                candidate
                for candidate in soup.find_all("form")
                if "inseriscispedizione" in str(candidate.get("action") or "")
            ),
            None,
        )
    if not isinstance(form, Tag):
        return {"action": None, "controls": []}

    controls = []
    for element in form.find_all(["input", "select", "textarea"]):
        name = str(element.get("name") or "").strip()
        if not name:
            continue
        input_type = str(element.get("type") or element.name).lower()
        entry: dict[str, Any] = {
            "name": name,
            "id": element.get("id"),
            "type": input_type,
            "required": element.has_attr("required"),
            "checked": element.has_attr("checked"),
            "disabled": element.has_attr("disabled"),
            "visible": _control_visible(element),
            "optional": element.get("data-optional"),
            "maxlength": element.get("maxlength"),
        }
        if element.name == "select":
            options = []
            selected = ""
            for option in element.find_all("option"):
                value = str(option.get("value") or "")
                is_selected = option.has_attr("selected")
                if is_selected or (not selected and not options):
                    selected = value
                options.append({"value": value, "text": clean(option.get_text(" ")), "selected": is_selected})
            entry["value"] = selected
            entry["options"] = options
        else:
            entry["value"] = element.get_text() if element.name == "textarea" else str(element.get("value") or "")
        controls.append(entry)
    return {"action": str(form.get("action") or "/inseriscispedizione"), "controls": controls}


def parse_label_groups(html: str) -> list[LabelGroup]:
    soup = BeautifulSoup(html, "html.parser")
    select = soup.find("select", id="gruppicorrieri")
    if not isinstance(select, Tag):
        return []
    groups: list[LabelGroup] = []
    for option in select.find_all("option"):
        value = str(option.get("value") or "").strip()
        name = clean(option.get_text(" "))
        if value and name:
            groups.append(LabelGroup(id=value, name=name))
    return groups


def parse_notifications(payload: str | dict[str, Any]) -> dict[str, Any]:
    """`/controllanotifiche` — usato solo per capire se ci sono novita'."""
    if isinstance(payload, str):
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            return {}
    return payload if isinstance(payload, dict) else {}
