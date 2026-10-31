"""Transport layer: sessione PHP, login, retry, rate limit, parsing.

Il portale non ha API pubbliche, ma il suo frontend usa endpoint interni
(`/auth`, `/lemiespedizioni_filter`, ...). Questo client li riusa esattamente
come farebbe il browser: stessa sessione PHPSESSID, stesso CSRF token, stessi
header. E' l'approccio piu' stabile e piu' economico; il browser automation
resta come fallback per i flussi che richiedono JavaScript (es. creazione
spedizione e download etichette).
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote as urlquote

import httpx

from . import mapping, parsers
from .config import Settings
from .models import (
    AddressBookEntry,
    CreateShipmentResult,
    Health,
    Invoice,
    LabelFile,
    LabelGroup,
    Offer,
    Quote,
    QuoteResult,
    RateList,
    Shipment,
    ShipmentDraft,
)

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

logger = logging.getLogger("travelbox.booking")
logger.setLevel(logging.INFO)

SHIPMENT_FILTERS = (
    "data_dal",
    "data_al",
    "mittente",
    "destinatario",
    "corriere",
    "stato",
    "numero_interno",
    "tracking",
    "contrassegni",
    "assicurazioni",
    "ecommerce",
    "inperdita",
    "gruppicorrieri",
)


class TravelBoxError(RuntimeError):
    """Errore generico del connettore."""


class AuthError(TravelBoxError):
    """Login rifiutato o sessione non rinnovabile."""


class UpstreamError(TravelBoxError):
    """Il portale ha risposto con un errore."""

    def __init__(self, status_code: int, body: str, path: str):
        self.status_code = status_code
        self.body = body[:500]
        self.path = path
        super().__init__(f"{path} -> HTTP {status_code}: {self.body[:200]}")


class NoOffers(TravelBoxError):
    """Il portale non ha restituito offerte per la tratta/collo richiesti."""


class WriteNotAvailable(TravelBoxError):
    """Flusso di scrittura non disponibile o non riconosciuto."""


class NotFound(TravelBoxError):
    """Spedizione o token inesistente."""


class TravelBoxClient:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or Settings()
        self._last_call = 0.0
        self._logged_in = False
        self._anagrafica: dict[str, str] | None = None
        self.http = httpx.Client(
            base_url=self.settings.base_url.rstrip("/"),
            timeout=self.settings.timeout,
            follow_redirects=True,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
            },
        )
        self._load_cookies()

    # -- lifecycle ---------------------------------------------------------

    def __enter__(self) -> "TravelBoxClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self.http.close()

    # -- sessione ----------------------------------------------------------

    def _load_cookies(self) -> None:
        path = Path(self.settings.session_file)
        if not path.exists():
            return
        try:
            data = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return
        for name, value in data.items():
            self.http.cookies.set(name, value)

    def _save_cookies(self) -> None:
        path = Path(self.settings.session_file)
        data = {cookie.name: cookie.value for cookie in self.http.cookies.jar}
        path.write_text(json.dumps(data))
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass

    def login(self) -> dict[str, Any]:
        self.settings.require_credentials()
        # Login sempre pulito: con un PHPSESSID ancora valido /login redirige
        # alla dashboard, dove il campo csrf_token non esiste.
        self.http.cookies.clear()
        self._throttle()
        page = self.http.get("/login")
        page.raise_for_status()
        token = parsers.extract_csrf(page.text)
        if not token:
            raise AuthError("CSRF token non trovato nella pagina /login")

        self._throttle()
        response = self.http.post(
            "/auth",
            data={
                "userid": self.settings.userid,
                "password": self.settings.password,
                "csrf_token": token,
            },
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "Referer": f"{self.settings.base_url.rstrip('/')}/login",
            },
        )
        if response.status_code >= 400:
            raise AuthError(f"Login HTTP {response.status_code}: {response.text[:200]}")
        try:
            payload = response.json()
        except ValueError as exc:
            raise AuthError(f"Risposta login non JSON: {response.text[:200]}") from exc
        if not payload.get("success"):
            raise AuthError(payload.get("message") or "Credenziali rifiutate")

        self._logged_in = True
        self._save_cookies()
        return payload

    def ensure_session(self) -> None:
        if not self._logged_in:
            self.login()

    def _set_cookie(self, name: str, value: str) -> None:
        self.http.cookies.set(name, value)

    def _delete_cookie(self, name: str) -> None:
        try:
            self.http.cookies.delete(name)
        except KeyError:
            pass

    def _session_expired(self, response: httpx.Response) -> bool:
        return (
            "kt_sign_in_form" in response.text
            and response.url.path.rstrip("/") in ("/login", "")
        )

    # -- trasporto ---------------------------------------------------------

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_call
        if elapsed < self.settings.min_interval:
            time.sleep(self.settings.min_interval - elapsed)
        self._last_call = time.monotonic()

    def _request(
        self,
        method: str,
        path: str,
        *,
        allow_relogin: bool = True,
        retry: bool = True,
        **kwargs: Any,
    ) -> httpx.Response:
        headers = dict(kwargs.pop("headers", {}) or {})
        headers.setdefault("X-Requested-With", "XMLHttpRequest")

        attempts = 3 if retry else 1
        for attempt in range(attempts):
            self._throttle()
            response = self.http.request(method, path, headers=headers, **kwargs)
            if (
                retry
                and response.status_code in (429, 500, 502, 503, 504)
                and attempt < attempts - 1
            ):
                time.sleep(1.5 * (attempt + 1))
                continue
            break

        if allow_relogin and self._session_expired(response):
            self.login()
            return self._request(
                method,
                path,
                allow_relogin=False,
                retry=False,
                headers=headers,
                **kwargs,
            )
        return response

    def _post_json(self, path: str, payload: dict[str, Any]) -> str:
        response = self._request(
            "POST",
            path,
            content=json.dumps(payload),
            headers={"Content-Type": "application/json"},
        )
        if response.status_code >= 400:
            raise UpstreamError(response.status_code, response.text, path)
        return response.text

    def _get_html(self, path: str) -> str:
        response = self._request("GET", path)
        if response.status_code >= 400:
            raise UpstreamError(response.status_code, response.text, path)
        return response.text

    # -- endpoint pubblici -------------------------------------------------

    def health(self) -> Health:
        try:
            self.ensure_session()
            html = self._get_html("/lemiespedizioni")
            ok = "kt_sign_in_form" not in html
            return Health(
                ok=ok,
                logged_in=ok,
                base_url=self.settings.base_url,
                checked_at=parsers._now(),
                detail=None if ok else "Sessione scaduta",
            )
        except Exception as exc:  # health non deve mai sollevare
            return Health(
                ok=False,
                logged_in=False,
                base_url=self.settings.base_url,
                checked_at=parsers._now(),
                detail=str(exc),
            )

    def shipments(self, page: int = 1, **filters: Any) -> list[Shipment]:
        payload: dict[str, Any] = {
            key: filters.get(key, "" if key not in ("contrassegni", "assicurazioni", "ecommerce", "inperdita") else False)
            for key in SHIPMENT_FILTERS
        }
        payload["pagina"] = str(page)
        html = self._post_json("/lemiespedizioni_filter", payload)
        return parsers.parse_shipments(html)

    def quotes(self, page: int = 1, **filters: Any) -> list[Quote]:
        payload: dict[str, Any] = {
            "data_dal": filters.get("data_dal", ""),
            "data_al": filters.get("data_al", ""),
            "mittente": filters.get("mittente", ""),
            "destinatario": filters.get("destinatario", ""),
            "corriere": filters.get("corriere", ""),
            "stato": filters.get("stato", ""),
            "numero_interno": filters.get("numero_interno", ""),
            "pagina": str(page),
        }
        html = self._post_json("/lemiequotazioni_filter", payload)
        return parsers.parse_quotes(html)

    def rate_lists(self) -> list[RateList]:
        return parsers.parse_rate_lists(self._get_html("/listini"))

    def invoices(self) -> list[Invoice]:
        return parsers.parse_invoices(self._get_html("/elencofatture"))

    def address_book(self) -> list[AddressBookEntry]:
        payload = self._post_json("/mittentidestinatarilist", {})
        return parsers.parse_address_book(payload)

    def cart(self) -> list[Shipment]:
        """Spedizioni create ma non ancora pagate (`/ilmiocarrello`)."""
        return parsers.parse_cart(self._get_html("/ilmiocarrello"))

    def resolve_comune(self, cap: str, city: str, country_code: str = "IT") -> dict[str, Any] | None:
        for payload in (
            {"cap": cap, "codstato": country_code},
            {"comune": city},
        ):
            response = self._request(
                "POST",
                "/getcomuni",
                data=payload,
                headers={
                    "Referer": f"{self.settings.base_url.rstrip('/')}/nuovaspedizione",
                    "Origin": self.settings.base_url.rstrip("/"),
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                },
            )
            if response.status_code >= 400:
                continue
            try:
                rows = response.json().get("data") or []
            except (ValueError, AttributeError):
                continue
            if not isinstance(rows, list) or not rows:
                continue
            wanted = parsers.clean(city).casefold()
            match = next(
                (row for row in rows if parsers.clean(str(row.get("nome") or "")).casefold() == wanted),
                None,
            )
            if match is None:
                candidates = [row for row in rows if len(str(row.get("provincia") or "")) == 2]
                if len(candidates) == 1:
                    match = candidates[0]
            if isinstance(match, dict):
                return match
        return None

    def find_recipient(self, name: str, street: str, cap: str) -> str | None:
        target = (
            parsers.clean(name).casefold(),
            parsers.clean(street).casefold(),
            cap.strip(),
        )
        for entry in self.address_book():
            party = entry.party
            if not entry.id or not party:
                continue
            current = (
                parsers.clean(party.name or "").casefold(),
                parsers.clean(party.street or "").casefold(),
                (party.postal_code or "").strip(),
            )
            if current == target:
                # Gli endpoint di scrittura vogliono l'id numerico, non il token.
                return entry.numeric_id or parsers.numeric_id(entry.id) or entry.id
        return None

    def create_recipient(
        self,
        *,
        name: str,
        street: str,
        cap: str,
        city: str,
        province: str,
        country_code: str = "IT",
        email: str | None = None,
        phone: str | None = None,
        contact: str | None = None,
        tax_code: str | None = None,
        vat: str | None = None,
        anagrafica_id: str | None = None,
    ) -> str:
        if not anagrafica_id:
            anagrafica_id = self.account_anagrafica_id()
        payload = {
            "anagrafica_id": anagrafica_id or "",
            "item_id": "0",
            "tipo": "DE",
            "cognomenome": name,
            "indirizzo1": street,
            "indirizzo2": "",
            "cap": cap,
            "citta": city,
            "provincia": province,
            "codnazione": country_code,
            "email": email or "",
            "telefono": phone or "",
            "cellulare": "",
            "contatto": contact or "",
            "codice_fiscale": tax_code or "",
            "partita_iva": vat or "",
        }
        response = self._request("POST", "/mittentidestinatari_create", json=payload)
        try:
            data = response.json()
        except ValueError as exc:
            raise UpstreamError(response.status_code, response.text, "/mittentidestinatari_create") from exc
        if response.status_code >= 400 or not data.get("success"):
            raise WriteNotAvailable(
                data.get("message") or "Il portale non ha creato il destinatario in rubrica"
            )
        found = self.find_recipient(name, street, cap)
        if found:
            return found
        for key in ("id", "idcliente", "idmittentedestinatario", "item_id", "idmd"):
            value = data.get(key)
            if value:
                return str(value)
        raise WriteNotAvailable("Destinatario creato ma id non recuperabile dalla rubrica")

    @staticmethod
    def _numeric_id(token: str) -> str:
        return parsers.numeric_id(token) or token

    def account_anagrafica(self) -> dict[str, str]:
        """Dati anagrafici dell'account da `/latuaanagrafica` (cache per client)."""
        if self._anagrafica is None:
            self._anagrafica = parsers.parse_account_anagrafica(
                self._get_html("/latuaanagrafica")
            )
        return self._anagrafica

    def account_anagrafica_id(self) -> str | None:
        """Id dell'anagrafica dell'account, richiesto per creare la rubrica."""
        return self.account_anagrafica().get("id") or None

    def delete_recipient(self, recipient_id: str) -> bool:
        numeric = self._numeric_id(recipient_id)
        if not numeric.isdigit():
            response = self._request("GET", f"/getmittentidestinatarimod/{recipient_id}")
            if response.status_code < 400:
                try:
                    numeric = str((response.json().get("data") or {}).get("id") or numeric)
                except (ValueError, AttributeError):
                    pass
        response = self._request("POST", "/mittentidestinatari_delete", json={"id": numeric})
        try:
            return bool(response.json().get("success"))
        except (ValueError, AttributeError):
            return False

    # -- dettaglio ---------------------------------------------------------

    def shipment_detail(self, shipment_id: str) -> Shipment:
        """Dettaglio spedizione.

        Accetta l'id numerico (33682), il riferimento TBC-33682 o il token
        base64 usato dal portale. Il portale accetta solo il token.
        """
        raw = str(shipment_id).strip()
        if raw.isdigit():
            token = parsers.encode_shipment_token(raw)
        elif re.fullmatch(r"TBC-\d+", raw, re.I):
            token = parsers.encode_shipment_token(raw.split("-", 1)[1])
        else:
            token = raw

        # Il portale vuole il token base64 grezzo: `=` non va percent-encoded.
        path = f"/vedispedizione/{urlquote(token, safe='=+/')}"
        response = self._request("GET", path)
        if response.status_code == 400:
            raise NotFound(f"Spedizione non trovata: {shipment_id}")
        if response.status_code >= 400:
            raise UpstreamError(response.status_code, response.text, path)
        return parsers.parse_shipment_detail(response.text, token)

    # -- preventivi e creazione -------------------------------------------

    def _resolve_city_id(
        self,
        *,
        city_id: str | None,
        city: str,
        cap: str,
        country_code: str,
    ) -> str:
        """Il campo cookie `localita` vuole l'idcomune numerico, non il nome."""
        if city_id:
            return str(city_id)

        for payload in (
            {"cap": cap, "codstato": country_code},
            {"comune": city},
        ):
            response = self._request(
                "POST",
                "/getcomuni",
                data=payload,
                headers={
                    "Referer": f"{self.settings.base_url.rstrip('/')}/nuovaspedizione",
                    "Origin": self.settings.base_url.rstrip("/"),
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                },
            )
            if response.status_code >= 400:
                continue
            try:
                rows = response.json().get("data") or []
            except (ValueError, AttributeError):
                continue
            if not isinstance(rows, list) or not rows:
                continue

            wanted = parsers.clean(city).casefold()
            match = next(
                (row for row in rows if parsers.clean(str(row.get("nome") or "")).casefold() == wanted),
                None,
            )
            if match is None and len(rows) == 1:
                match = rows[0]
            if isinstance(match, dict) and match.get("idcomune"):
                return str(match["idcomune"])

        raise WriteNotAvailable(
            f"Comune non risolto per {city!r} (CAP {cap}, {country_code}): "
            "passare sender_city_id/recipient_city_id oppure verificare il CAP."
        )

    def quote(self, draft: ShipmentDraft) -> QuoteResult:
        """Chiede le offerte al portale, impostando i cookie che usa il form.

        Il flusso ricalca esattamente il browser: cookie `datispedizione`
        (colli) + `datiSpedizioneCompleta` (indirizzi) + `ambito`, poi
        `POST /mostraofferte`. Due dettagli non ovvi, verificati sul portale:
        `stato` vuole il codice paese (IT), non "Italia"; `localita` vuole
        l'idcomune numerico restituito da `/getcomuni`, non il nome.
        """
        timestamp = int(time.time() * 1000)
        nazionale = draft.service_type == "nazionale"

        self.ensure_session()
        sender_city_id = self._resolve_city_id(
            city_id=draft.sender_city_id,
            city=draft.sender_city,
            cap=draft.sender_cap,
            country_code=draft.sender_country_code,
        )
        recipient_city_id = self._resolve_city_id(
            city_id=draft.recipient_city_id,
            city=draft.recipient_city,
            cap=draft.recipient_cap,
            country_code=draft.recipient_country_code,
        )

        dati = {
            "partenza": {
                "stato": draft.sender_country_code,
                "codStato": draft.sender_country_code,
                "cap": draft.sender_cap,
                "localita": sender_city_id,
                "provincia": draft.sender_province,
                "mittenteid": draft.sender_id,
            },
            "destinazione": {
                "stato": draft.recipient_country_code,
                "codStato": draft.recipient_country_code,
                "cap": draft.recipient_cap,
                "localita": recipient_city_id,
                "provincia": draft.recipient_province,
                "destinatarioid": draft.recipient_id,
            },
            "timestamp": timestamp,
        }
        tipologia = {"pacchi": 1, "documenti": 2, "pallet": 3}
        packages = []
        for index, package in enumerate(draft.packages):
            packages.append(
                {
                    "id": index + 1,
                    "colli": int(package.pieces or 1),
                    "larghezza": _num(package.width_cm),
                    "lunghezza": _num(package.length_cm),
                    "altezza": _num(package.height_cm),
                    "peso": f"{package.weight_kg or 0:.3f}",
                    "tipologia": tipologia.get((package.type or "pacchi").lower(), 1),
                }
            )

        self._set_cookie("ambito", draft.service_type)
        self._set_cookie("datiSpedizioneCompleta", json.dumps(dati))
        if nazionale:
            self._set_cookie("datispedizione", json.dumps(packages))
            self._set_cookie("spedizionen", "n")
        else:
            self._set_cookie("datispedizioneie", json.dumps(packages))
            self._set_cookie("spedizioneie", "n")

        response = self._request(
            "POST",
            "/mostraofferte",
            data={"x": "1"},
            headers={
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Referer": f"{self.settings.base_url.rstrip('/')}/nuovaspedizione",
                "Origin": self.settings.base_url.rstrip("/"),
                "Accept": "text/html, */*; q=0.01",
            },
        )
        if response.status_code >= 400:
            raise UpstreamError(response.status_code, response.text, "/mostraofferte")

        offers, message = parsers.parse_offers(response.text)
        return QuoteResult(
            offers=offers,
            message=message,
            draft=draft,
            fetched_at=parsers._now(),
        )

    def booking_form(self, draft: ShipmentDraft, offer_id: str | None = None) -> dict[str, Any]:
        result = self.quote(draft)
        if not result.offers:
            raise NoOffers(result.message or "Nessuna offerta disponibile per la tratta richiesta")
        offer = next((o for o in result.offers if o.id == offer_id), None) if offer_id else result.offers[0]
        if offer is None:
            raise WriteNotAvailable(f"Offerta {offer_id} non presente nella risposta del portale")
        if not offer.book_url:
            raise WriteNotAvailable("L'offerta non espone il link `creaspedizione/...` necessario per la preview")
        response = self._request("GET", offer.book_url)
        if response.status_code >= 400:
            raise UpstreamError(response.status_code, response.text, offer.book_url)
        described = parsers.describe_booking_form(response.text)
        action, fields = parsers.parse_booking_form(response.text)
        return {
            "offer": offer,
            "action": action,
            "fields": fields,
            "controls": described.get("controls", []),
            "preview_status": response.status_code,
            "preview_length": len(response.text),
        }

    def create_shipment(
        self,
        draft: ShipmentDraft,
        offer_id: str | None = None,
        confirm: bool = False,
    ) -> CreateShipmentResult:
        """Crea la spedizione in due fasi.

        `confirm=False` (default) si ferma alla preview con l'offerta scelta:
        nessuna scrittura. Con `confirm=True` apre `creaspedizione/...` e invia
        il form con `metodo_pagamento=carrello`: la spedizione finisce nel
        carrello, **senza** pagamento. Il checkout resta un passo separato e
        manuale.
        """
        result = self.quote(draft)
        if not result.offers:
            raise NoOffers(result.message or "Nessuna offerta disponibile per la tratta richiesta")

        offer: Offer | None = None
        if offer_id:
            offer = next((o for o in result.offers if o.id == offer_id), None)
            if offer is None:
                raise WriteNotAvailable(f"Offerta {offer_id} non presente nella risposta del portale")
        else:
            offer = result.offers[0]

        if not confirm:
            return CreateShipmentResult(
                status="preview",
                message=(
                    "Preview: nessuna spedizione creata. Imposta confirm=true per "
                    "aggiungere l'offerta al carrello (nessun pagamento)."
                ),
                offer=offer,
                upstream_response=offer.book_url,
            )

        if not offer.book_url:
            raise WriteNotAvailable(
                "L'offerta non espone il link `creaspedizione/...` necessario per "
                "aprire la preview: aggiornare parse_offers."
            )

        preview = self._request("GET", offer.book_url)
        if preview.status_code >= 400:
            raise UpstreamError(preview.status_code, preview.text, offer.book_url)

        action, fields = parsers.parse_booking_form(preview.text)
        if not action or not fields:
            raise WriteNotAvailable(
                "Form di conferma non riconosciuto nella preview: "
                "aggiornare parse_booking_form."
            )

        overrides = {
            "mittente[cognomenome]": draft.sender_name,
            "mittente[indirizzo]": draft.sender_street,
            "mittente[email]": draft.sender_email,
            "mittente[telefono]": draft.sender_phone,
            "destinatario[cognomenome]": draft.recipient_name,
            "destinatario[indirizzo]": draft.recipient_street,
            "destinatario[indirizzo2]": draft.recipient_street2,
            "destinatario[email]": draft.recipient_email,
            "destinatario[telefono]": draft.recipient_phone,
            "destinatario[contatto]": draft.recipient_contact,
            "destinatario[codice_fiscale]": draft.recipient_tax_code,
            "destinatario[partita_iva]": draft.recipient_vat,
            "descrizione_beni": draft.description,
            "data_ritiro": draft.pickup_date,
            "fascia_oraria_ritiro": draft.pickup_slot,
        }
        for name, value in overrides.items():
            if value:
                fields[name] = value

        # `mittente[id]` e `destinatario[id]` devono essere numerici: con il
        # token base64 della rubrica il portale risponde HTTP 500.
        sender_id = parsers.numeric_id(draft.sender_id) or draft.sender_id
        if sender_id:
            fields["mittente[id]"] = str(sender_id)
        recipient_id = parsers.numeric_id(draft.recipient_id) or draft.recipient_id
        if recipient_id:
            fields["destinatario[id]"] = str(recipient_id)

        if not (fields.get("mittente[contatto]") or "").strip():
            fields["mittente[contatto]"] = draft.sender_contact or draft.sender_name or "MUVPACK"
        if len((fields.get("mittente[telefono]") or "").strip()) < 8:
            fields["mittente[telefono]"] = fields.get("mobile_ritiro") or "0000000000"
        if len((fields.get("destinatario[telefono]") or "").strip()) < 8:
            fields["destinatario[telefono]"] = "0000000000"
        if not (fields.get("descrizione_beni") or "").strip():
            fields["descrizione_beni"] = "Merci varie"

        # Limiti `maxlength` del form: il submit via API non passa dal browser,
        # quindi vanno applicati qui per evitare rifiuti/500 lato portale.
        limits = {
            "mittente[cognomenome]": 35,
            "mittente[indirizzo]": 35,
            "mittente[indirizzo2]": 35,
            "mittente[email]": 50,
            "mittente[telefono]": 13,
            "mittente[contatto]": 35,
            "mittente[codice_fiscale]": 30,
            "mittente[partita_iva]": 30,
            "destinatario[cognomenome]": 35,
            "destinatario[indirizzo]": 35,
            "destinatario[indirizzo2]": 35,
            "destinatario[email]": 50,
            "destinatario[telefono]": 13,
            "destinatario[contatto]": 35,
            "destinatario[codice_fiscale]": 30,
            "destinatario[partita_iva]": 30,
            "descrizione_beni": 25,
        }
        for name, limit in limits.items():
            value = str(fields.get(name) or "").strip()
            if value:
                fields[name] = value[:limit]

        # Il form preseleziona `bonifico`: lo sostituiamo SEMPRE con carrello.
        # Nessun endpoint di pagamento viene chiamato da questo connettore.
        fields["metodo_pagamento"] = "carrello"

        key_fields = (
            "mittente[cognomenome]",
            "mittente[indirizzo]",
            "mittente[email]",
            "mittente[telefono]",
            "mittente[contatto]",
            "destinatario[id]",
            "destinatario[cognomenome]",
            "destinatario[indirizzo]",
            "destinatario[email]",
            "destinatario[telefono]",
            "destinatario[contatto]",
            "metodo_pagamento",
            "credito_residuo",
            "totale_spedizione",
            "data_ritiro",
            "fascia_oraria_ritiro",
            "ritiro_presso",
            "ritiro_presso_mittente_hidden",
            "serviziAggiuntivi[1]",
            "delivery_point_selezionato",
        )
        logger.info(
            "TravelBox submit action=%s offer=%s fields=%s values=%s",
            action,
            offer.id,
            len(fields),
            {name: fields.get(name) for name in key_fields if name in fields},
        )

        before = {item.id for item in self.cart()}
        response = self._request(
            "POST",
            action,
            files={name: (None, value) for name, value in fields.items()},
            follow_redirects=False,
            # Mai retry su una scrittura: un 500 dopo la creazione duplicherebbe
            # la spedizione nel carrello.
            retry=False,
            headers={
                "Referer": f"{self.settings.base_url.rstrip('/')}/{offer.book_url.lstrip('/')}",
                "Origin": self.settings.base_url.rstrip("/"),
            },
        )
        if response.status_code >= 400:
            logger.warning(
                "TravelBox submit failed status=%s action=%s payload=%s headers=%s body_len=%s body=%s",
                response.status_code,
                action,
                {name: fields.get(name) for name in key_fields if name in fields},
                dict(response.headers),
                len(response.text),
                parsers.clean(response.text)[:500],
            )
            raise UpstreamError(response.status_code, response.text, action)

        created = next((item for item in self.cart() if item.id not in before), None)
        if created is None:
            raise WriteNotAvailable(
                "Il portale ha risposto "
                f"HTTP {response.status_code} ma nel carrello non compare una nuova spedizione: "
                f"{parsers.clean(response.text)[:300]}"
            )

        logger.info("TravelBox created shipment reference=%s id=%s", created.reference, created.id)
        return CreateShipmentResult(
            status="submitted",
            message=(
                f"Spedizione {created.reference or created.id} aggiunta al carrello "
                "con metodo_pagamento=carrello. Nessun pagamento eseguito."
            ),
            offer=offer,
            shipment=created,
            upstream_response=(
                f"HTTP {response.status_code} "
                f"{response.headers.get('location', '')}"
            ).strip()[:2000],
        )

    # -- etichette ---------------------------------------------------------

    def label_groups(self) -> list[LabelGroup]:
        return parsers.parse_label_groups(self._get_html("/lemiespedizioni"))

    def download_label(self, token: str) -> LabelFile:
        """Scarica un PDF etichetta da /downloadfile/{token}.

        Il token arriva dalla riga spedizione (`stampaEtichetta`) oppure dal
        link nel dettaglio; e' base64 e puo' contenere `=`.
        """
        token = token.strip()
        # `=` fa parte del token: se percent-encoded il portale risponde 400.
        path = f"/downloadfile/{urlquote(token, safe='=+/')}"
        response = self._request("GET", path)
        if response.status_code >= 400:
            raise UpstreamError(response.status_code, response.text, path)

        filename = None
        disposition = response.headers.get("content-disposition", "")
        match = re.search(r"filename\*?=(?:UTF-8''|\")?([^\";]+)", disposition, re.I)
        if match:
            filename = match.group(1).strip()

        return LabelFile(
            token=token,
            url=path,
            content_type=response.headers.get("content-type"),
            filename=filename,
            size=len(response.content),
            content=response.content,
        )

    def request_labels(self, shipment_id: str | int) -> dict[str, Any]:
        """Chiede al portale di preparare le etichette (`/scaricaetichette`)."""
        payload = {
            "idSpedizione": int(shipment_id) if str(shipment_id).isdigit() else shipment_id
        }
        response = self._post_json("/scaricaetichette", payload)
        try:
            return json.loads(response)
        except json.JSONDecodeError as exc:
            raise UpstreamError(200, response, "/scaricaetichette") from exc

    def merge_labels(self, shipment_ids: list[int | str], group_id: str) -> LabelFile:
        """Unisce le etichette di piu' spedizioni (`/uniscietichette`).

        Il portale risponde {success, param}; `param` e' il token del PDF.
        """
        if not shipment_ids:
            raise ValueError("shipment_ids non puo' essere vuoto")
        # httpx serializza una lista come chiave ripetuta: spedizioniEtichette[]=1&...
        form = {
            "id_gruppo_corrieri": str(group_id),
            "spedizioniEtichette[]": [str(sid) for sid in shipment_ids],
        }

        response = self._request("POST", "/uniscietichette", data=form)
        if response.status_code >= 400:
            raise UpstreamError(response.status_code, response.text, "/uniscietichette")
        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamError(response.status_code, response.text, "/uniscietichette") from exc
        if not payload.get("success"):
            raise UpstreamError(response.status_code, response.text, "/uniscietichette")
        token = payload.get("param")
        if not token:
            raise WriteNotAvailable("Il portale non ha restituito il token del PDF etichette")
        return self.download_label(str(token))


def _num(value: float | None) -> str:
    if value is None:
        return "0.00"
    return f"{value:.2f}"
