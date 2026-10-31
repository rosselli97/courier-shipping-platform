"""Mappa dei campi: un solo posto da toccare quando il portale cambia.

Il portale non espone un contratto stabile, quindi il mapping e' per etichetta
(header di tabella / chiave JSON) con alias multipli. Se domani rinominano una
colonna, si aggiunge un alias qui: parser e API restano invariati.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping, Optional

SHIPMENT_ALIASES: dict[str, tuple[str, ...]] = {
    "created_at": ("Data Creazione", "Data", "Data spedizione"),
    "reference": ("Spedizione", "Numero"),
    "payment_method": ("Pagamento",),
    "service": ("Servizi", "Servizio", "Tipo servizio"),
    "carrier": ("Corriere",),
    "parties": ("Mitt./Dest.", "Mittente/Destinatario", "Mittente e destinatario"),
    "price": ("Imp. Pagato", "Importo", "Totale"),
    "status": ("Stato", "Stato spedizione"),
}

QUOTE_ALIASES: dict[str, tuple[str, ...]] = {
    "created_at": ("Data Creazione", "Data"),
    "carrier": ("Corriere",),
    "parties": ("Mitt./Dest.", "Mittente/Destinatario"),
    "price": ("Importo", "Totale", "Imp. Pagato"),
    "status": ("Stato", "Stato quotazione"),
}

INVOICE_ALIASES: dict[str, tuple[str, ...]] = {
    "number": ("Numero", "N."),
    "date": ("Data", "Data fattura"),
    "customer": ("Cliente", "Intestatario"),
    "amount": ("Importo", "Totale"),
}

RATE_LIST_ALIASES: dict[str, tuple[str, ...]] = {
    "name": ("nome", "Nome"),
    "type": ("tipo", "Tipo"),
    "owner": ("proprietario", "Proprietario"),
    "valid_from": ("valido_da", "Data inizio validità"),
    "valid_to": ("valido_a", "Data fine validità"),
    "cloned_from": ("clone_di", "Clone di"),
    "carrier": ("corriere", "Corriere"),
}

# Pagina /vedispedizione/{token}: i campi di riepilogo sono testo libero
# dentro <span><strong>Etichetta: valore</strong></span>, quindi si estraggono
# con regex ancorate all'etichetta. Se il portale cambia una label, si cambia
# una riga qui.
DETAIL_TEXT_PATTERNS: dict[str, str] = {
    "reference": r"Spedizione:\s*(TBC-\d+)",
    "service": r"Tipo spedizione:\s*(\w+)",
    "created_at": r"Data e ora:\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)",
    "chargeable_weight_kg": r"Peso tassabile:\s*([\d.,]+)\s*kg",
    "status": (
        r"Stato:\s*([A-ZÀ-Ù][A-ZÀ-Ù0-9 _-]*?)"
        r"(?=\s+(?:Totale colli|Vettore scelto|Tracking della spedizione|Costo spedizione|"
        r"Data ritiro|Annulla|Conferma)\b|$)"
    ),
    "total_pieces": r"Totale colli:\s*(\d+)",
    "carrier": r"Vettore scelto:\s*(.+?)\s+Tracking della spedizione:",
    # Almeno una cifra: evita di catturare il testo UI "Modifica".
    "tracking_number": r"Tracking della spedizione:\s*(?=[A-Za-z0-9]*\d)([A-Za-z0-9]{6,})",
    "price": r"Costo spedizione:\s*(€\s*[\d.,]+)",
    "pickup_date": r"Data ritiro:\s*(\d{2}/\d{2}/\d{4})",
    "pickup_code": r"Codice ritiro:\s*([^\s]+(?:\s+-\s+\S+)?)",
}

# Il dettaglio espone i dati di mittente/destinatario come input con nome
# `mittente[campo]` e `destinatario[campo]`: e' molto piu' stabile delle label.
DETAIL_INPUT_PREFIXES: dict[str, str] = {
    "sender": "mittente",
    "recipient": "destinatario",
}

# Una riga collo: "1: Colli: 1, Peso: 20 kg, Larghezza: 40 cm, Altezza: 40 cm Lunghezza: 40 cm"
PACKAGE_PATTERN = (
    r"\d+:\s*Colli:\s*(?P<pieces>\d+),\s*Peso:\s*(?P<weight>[\d.,]+)\s*kg,\s*"
    r"Larghezza:\s*(?P<width>[\d.,]+)\s*cm,\s*Altezza:\s*(?P<height>[\d.,]+)\s*cm\s*"
    r"Lunghezza:\s*(?P<length>[\d.,]+)\s*cm"
)

OFFER_PRICE_PATTERN = r"€\s*(?P<price>[\d.,]+)"
OFFER_URL_PATTERN = r"(?:url|action|href|data-url)\s*[=:]\s*['\"](?P<url>[^'\"]+)['\"]"
OFFER_ID_KEYS = ("idofferta", "offerta", "id_offerta", "id", "token")


def pick(data: Mapping[str, Any], aliases: Iterable[str]) -> Optional[str]:
    """Primo valore non vuoto tra gli alias, ignorando differenze di maiuscole."""
    lowered = {str(k).strip().lower(): v for k, v in data.items()}
    for alias in aliases:
        value = lowered.get(alias.strip().lower())
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return str(value) if not isinstance(value, str) else value
    return None
