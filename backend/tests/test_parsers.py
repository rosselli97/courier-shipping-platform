import base64
import json
from decimal import Decimal

from travelbox.parsers import (
    decode_token,
    encode_shipment_token,
    numeric_id,
    parse_account_anagrafica,
    parse_account_anagrafica_id,
    parse_address_book,
    parse_booking_form,
    parse_cart,
    parse_invoices,
    parse_label_groups,
    parse_money,
    parse_offers,
    parse_quotes,
    parse_rate_lists,
    parse_shipment_detail,
    parse_shipments,
    to_float,
)


SHIPMENTS_HTML = """
<table id="tabellaspedizioni">
  <tbody>
    <tr>
      <td><input type="checkbox" data-idspedizione="33682"></td>
      <td>16/10/2026 11:28<br><strong>TBC-33682</strong><br><strong>Pagamento on line</strong></td>
      <td><strong></strong></td>
      <td><img alt=""></td>
      <td>Rosa mistretta &rarr;</td>
      <td>8,86</td>
      <td>TRASMESSA</td>
      <td>
        <a href="/vedispedizione/aWRzcGVkaXppb25lPTMzNjgy">Vedi</a>
        <a href="javascript:void(0)"
           onclick="trackingSpedizione('https://www.poste.it/cerca/#/risultati-spedizioni/3UW1L9L080507')">Tracking</a>
        <a href="javascript:void(0)"
           onclick="stampaEtichetta('aWRzcGVkaXppb25lPTMzNjgyJmlkYWxsZWdhdG89NDExODM=')">Etichetta</a>
      </td>
    </tr>
    <tr>
      <td>&nbsp;</td><td colspan="6" class="text-end">Totali:</td>
      <td><span>0,00 &euro;</span></td>
    </tr>
  </tbody>
</table>
"""

RATES_HTML = """
<table><tbody>
<tr>
  <td id="nome_38879">BRT (31)</td>
  <td id="tipo_38879">NAZIONALE</td>
  <td id="proprietario_38879">FRANCESCO GIULIANO</td>
  <td id="valido_da_38879">2025-01-01</td>
  <td id="valido_a_38879">2999-01-01</td>
  <td id="clone_di_38879">BRT</td>
  <td id="corriere_38879">BRT</td>
  <td id="funzioni_38879"><i data-id="38879"></i></td>
</tr>
</tbody></table>
"""

INVOICES_HTML = """
<table><thead><tr>
  <th>Numero</th><th>Data</th><th>Cliente</th><th>Importo</th><th>Azioni</th>
</tr></thead><tbody>
<tr>
  <td>4249-A</td><td>2026-10-16</td><td>FRANCESCO GIULIANO</td><td>€ 9,29</td>
  <td><a href="/stampafattura/aWRGYXR0dXJhPTQyOTM=">Visualizza</a></td>
</tr>
</tbody></table>
"""

QUOTES_HTML = """
<table><thead><tr>
  <th>Data Creazione</th><th>Corriere</th><th>Mitt./Dest.</th><th>Importo</th>
  <th>Stato</th><th>Funzioni</th>
</tr></thead><tbody>
<tr>
  <td>2026-10-15</td><td>GLS</td><td>Mario Rossi / Luca Bianchi</td>
  <td>€ 8,00</td><td>In attesa</td><td></td>
</tr>
</tbody></table>
"""

ADDRESS_BOOK = {
    "success": True,
    "html": """
    <tr>
      <td>Alessio rosselli</td><td>Via Dei Bersaglieri 33</td><td>Montelepre</td>
      <td>90086</td><td>PA</td><td>IT</td><td>3349602318</td><td>Mittente</td>
      <td><button onclick="editItem('aWQ9OTY0Nw==')">Modifica</button></td>
    </tr>
    """,
}

ACCOUNT_ANAGRAFICA_HTML = """
<form id="kt_modal_anagrafica_form">
  <input type="hidden" name="action" value="update">
  <input type="hidden" name="id" value="634">
  <input type="hidden" name="iduser" value="589">
  <input type="text" name="ragione_sociale" value="FRANCESCO GIULIANO">
  <input type="text" name="email" value="alessio.rosselli97@gmail.com">
  <input type="text" name="cod_iva" value="">
</form>
"""

DETAIL_HTML = """
<span><strong>Tipo spedizione: Pacchi</strong></span>
<span><strong>Spedizione: TBC-33682</strong></span>
<span><strong>Data e ora: 16/10/2026 11:28:05</strong></span>
<span><strong>Peso tassabile: 20,00 kg</strong></span>
<span><strong>Stato: TRASMESSA</strong></span>
<strong><span>Totale colli: 1</span></strong>
<strong>Vettore scelto: POSTE DELIVERY BUSINESS EXPRESS 1</strong><br>
Tracking della spedizione: 3UW1L9L080507
<div class="alert">1: Colli: 1, Peso: 20 kg, Larghezza: 40 cm, Altezza: 40 cm Lunghezza: 40 cm</div>
<div><span class="fw-bold">Costo spedizione:</span><div>€ 8,86</div></div>
<div>Data ritiro: 19/10/2026</div>

<table>
  <tr><td><span class="fw-bold">Cognome e nome:</span></td>
      <td><input name="mittente[cognomenome]" value="Rosa mistretta "></td></tr>
  <tr><td><span class="fw-bold">Indirizzo:</span></td>
      <td><input name="mittente[indirizzo]" value="Via Lorenzo perosi 38"></td></tr>
  <tr><td><span class="fw-bold">CAP:</span></td>
      <td>90043<input type="hidden" name="mittente[cap]" value="90043"></td></tr>
  <tr><td><span class="fw-bold">Località:</span></td>
      <td><select name="mittente[localita]"><option selected>Camporeale</option></select></td></tr>
  <tr><td><span class="fw-bold">Provincia:</span></td>
      <td><input name="mittente[provincia]" value="PA"></td></tr>
  <tr><td><span class="fw-bold">Nazione:</span></td><td>Italia</td></tr>
  <tr><td><span class="fw-bold">Email:</span></td>
      <td><input name="mittente[email]" value="alessio.rosselli97@gmail.com"></td></tr>
</table>

<table>
  <tr><td><span class="fw-bold">Cognome e nome:</span></td>
      <td><input name="destinatario[cognomenome]" value="Bonura Rossella "></td></tr>
  <tr><td><span class="fw-bold">Indirizzo:</span></td>
      <td><input name="destinatario[indirizzo]" value="VIALE EUGENIO DUPRE THESEIDER 27"></td></tr>
  <tr><td><span class="fw-bold">CAP:</span></td>
      <td><input name="destinatario[cap]" value="02100"></td></tr>
  <tr><td><span class="fw-bold">Località:</span></td>
      <td><select name="destinatario[localita]"><option selected>Rieti</option></select></td></tr>
  <tr><td><span class="fw-bold">Provincia:</span></td>
      <td><input name="destinatario[provincia]" value="RI"></td></tr>
  <tr><td><span class="fw-bold">Nazione:</span></td><td>Francia</td></tr>
  <tr><td><span class="fw-bold">Telefono:</span></td>
      <td><input name="destinatario[telefono]" value="3791296638"></td></tr>
</table>

<a href="/downloadfile/aWRzcGVkaXppb25lPTMzNjgyJmlkYWxsZWdhdG89NDExODM=">
  Scarica Etichette di spedizione
</a>
"""

def _offer_token() -> str:
    offer = {
        "idcorriere": 10,
        "corriere": "POSTE DELIVERY BUSINESS EXPRESS 1",
        "prezzo1": 7.26,
        "prezzo2": 0,
        "prezzo3": 0,
        "vendita": "0.00",
        "valuta": "EUR",
        "peso": 20,
        "idlistino": 38899,
        "iddettaglio": 214424,
        "notes": "-PRODOTTO POSTALE AD ALTA PRIORITA'.\n-LDV ISTANTANEA.",
    }
    raw = "idlistino=38899&iddettaglio=214424&offerta=" + json.dumps(offer)
    return base64.b64encode(raw.encode()).decode()


OFFERS_HTML = f"""
<table>
  <thead><tr>
    <th>Corriere</th><th></th><th>Peso tassato</th><th>Prezzo</th>
    <th>Iva</th><th>Totale</th><th>Valuta</th><th></th>
  </tr></thead>
  <tbody>
    <tr>
      <td><img alt="POSTE DELIVERY BUSINESS EXPRESS 1"></td>
      <td>Prezzo</td>
      <td>20,00 kg</td>
      <td>7,26</td>
      <td>1,60</td>
      <td>8,86</td>
      <td>EUR</td>
      <td><a href="creaspedizione/{_offer_token()}">Prenota</a></td>
    </tr>
  </tbody>
</table>
"""

CART_HTML = """
<table><tbody>
<tr>
  <td><input type="checkbox" name="spedizioni_da_pagare[]" value="33948" data-costo="8.86"></td>
  <td>18/10/2026<br><strong>TBC-33948</strong></td>
  <td><span class="badge"><img alt="" src="data:image/jpeg;base64,AAAA"></span></td>
  <td>Rosa mistretta &rarr; Bonura Rossella</td>
  <td>8,86 &euro;</td>
  <td>IN CARRELLO</td>
  <td></td>
</tr>
</tbody></table>
"""

BOOKING_FORM_HTML = """
<form id="form-spedizione" method="post" action="/inseriscispedizione"
      enctype="multipart/form-data">
  <input type="hidden" name="idlistino" value="38899">
  <input type="hidden" name="jsonCatenaMarkup" value='{"prezzo_finale":8.86}'>
  <input type="text" name="mittente[cognomenome]" value="Rosa mistretta">
  <input type="radio" name="metodo_pagamento" value="bonifico" checked>
  <input type="radio" name="metodo_pagamento" value="carrello">
  <input type="checkbox" name="serviziAggiuntivi[1]" value="1">
  <input type="checkbox" name="serviziAggiuntivi[9]" value="1" checked>
  <select name="fascia_oraria_ritiro">
    <option value="09-13">09-13</option>
    <option value="14-18" selected>14-18</option>
  </select>
  <textarea name="note">test</textarea>
</form>
"""

EMPTY_OFFERS_HTML = """
<div class="alert alert-info text-center">
  <i class="fas fa-info-circle me-2"></i>
  Nessuna offerta disponibile al momento.
</div>
"""

LABEL_GROUPS_HTML = """
<select id="gruppicorrieri">
  <option value="">Tutti</option>
  <option value="12">POSTE DELIVERY</option>
  <option value="13">BRT</option>
</select>
"""


def test_parse_money_italian_format():
    money = parse_money("€ 1.234,56")
    assert money is not None
    assert money.amount == Decimal("1234.56")
    assert money.currency == "EUR"
    assert parse_money("") is None


def test_to_float_accepts_both_decimal_separators():
    assert to_float("20,00") == 20.0
    assert to_float("20.000") == 20.0
    assert to_float("40.00") == 40.0
    assert to_float("1.234,56") == 1234.56
    assert to_float("") is None


def test_token_roundtrip_and_decode():
    token = encode_shipment_token(33682)
    assert token == "aWRzcGVkaXppb25lPTMzNjgy"
    assert decode_token(token) == {"idspedizione": "33682"}
    assert decode_token("aWRzcGVkaXppb25lPTMzNjgyJmlkYWxsZWdhdG89NDExODM=") == {
        "idspedizione": "33682",
        "idallegato": "41183",
    }
    assert numeric_id("13563") == "13563"
    assert numeric_id("aWQ9MTM1NjM=") == "13563"
    assert numeric_id("aWQ9OTY0Nw==") == "9647"
    assert numeric_id(None) is None


def test_parse_shipments_maps_real_row():
    shipments = parse_shipments(SHIPMENTS_HTML)
    assert len(shipments) == 1
    shipment = shipments[0]
    assert shipment.id == "33682"
    assert shipment.reference == "TBC-33682"
    assert shipment.created_at == "16/10/2026 11:28"
    assert shipment.status == "TRASMESSA"
    assert shipment.price is not None and shipment.price.amount == Decimal("8.86")
    assert shipment.tracking_number == "3UW1L9L080507"
    assert shipment.tracking_url.startswith("https://www.poste.it/")
    assert shipment.detail_url == "/vedispedizione/aWRzcGVkaXppb25lPTMzNjgy"
    assert shipment.label_token == "aWRzcGVkaXppb25lPTMzNjgyJmlkYWxsZWdhdG89NDExODM="
    assert shipment.sender is not None and shipment.sender.name == "Rosa mistretta"


def test_parse_shipment_detail_ignores_modifica_as_tracking():
    shipment = parse_shipment_detail(
        "<span><strong>Spedizione: TBC-1</strong></span>"
        "<span><strong>Stato: IN CARRELLO</strong></span>"
        "<span><strong>Tracking della spedizione: Modifica</strong></span>",
        "token",
    )
    assert shipment.tracking_number is None


def test_parse_shipment_detail_summary_parties_packages_and_label():
    shipment = parse_shipment_detail(DETAIL_HTML, "aWRzcGVkaXppb25lPTMzNjgy")
    assert shipment.reference == "TBC-33682"
    assert shipment.service == "Pacchi"
    assert shipment.created_at == "16/10/2026 11:28:05"
    assert shipment.status == "TRASMESSA"
    assert shipment.carrier == "POSTE DELIVERY BUSINESS EXPRESS 1"
    assert shipment.tracking_number == "3UW1L9L080507"
    assert shipment.chargeable_weight_kg == 20.0
    assert shipment.pieces == 1
    assert shipment.price is not None and shipment.price.amount == Decimal("8.86")
    assert shipment.pickup_date == "19/10/2026"
    assert shipment.label_token == "aWRzcGVkaXppb25lPTMzNjgyJmlkYWxsZWdhdG89NDExODM="

    assert shipment.sender is not None
    assert shipment.sender.name == "Rosa mistretta"
    assert shipment.sender.postal_code == "90043"
    assert shipment.sender.city == "Camporeale"
    assert shipment.sender.country == "Italia"

    assert shipment.recipient is not None
    assert shipment.recipient.name == "Bonura Rossella"
    assert shipment.recipient.province == "RI"
    assert shipment.recipient.phone == "3791296638"
    assert shipment.sender.country == "Italia"
    assert shipment.recipient.country == "Francia"

    assert len(shipment.packages) == 1
    package = shipment.packages[0]
    assert package.pieces == 1
    assert package.weight_kg == 20.0
    assert package.width_cm == 40.0
    assert package.height_cm == 40.0
    assert package.length_cm == 40.0


def test_parse_offers_extracts_table_row_and_booking_link():
    offers, message = parse_offers(OFFERS_HTML)
    assert message is None
    assert len(offers) == 1
    offer = offers[0]
    assert offer.id == "214424"
    assert offer.list_id == "38899"
    assert offer.carrier == "POSTE DELIVERY BUSINESS EXPRESS 1"
    assert offer.service == "PRODOTTO POSTALE AD ALTA PRIORITA'."
    assert offer.net_price is not None and offer.net_price.amount == Decimal("7.26")
    assert offer.tax is not None and offer.tax.amount == Decimal("1.60")
    assert offer.price is not None and offer.price.amount == Decimal("8.86")
    assert offer.weight_kg == 20.0
    assert offer.currency == "EUR"
    assert offer.book_url is not None and offer.book_url.startswith("creaspedizione/")
    assert offer.submit_method == "GET"


def test_parse_cart_maps_unpaid_shipment():
    items = parse_cart(CART_HTML)
    assert len(items) == 1
    item = items[0]
    assert item.id == "33948"
    assert item.reference == "TBC-33948"
    assert item.created_at == "18/10/2026"
    assert item.status == "IN CARRELLO"
    assert item.price is not None and item.price.amount == Decimal("8.86")
    assert item.sender is not None and item.sender.name == "Rosa mistretta"


def test_parse_booking_form_only_selected_and_cart_can_override():
    action, fields = parse_booking_form(BOOKING_FORM_HTML)
    assert action == "/inseriscispedizione"
    assert fields["idlistino"] == "38899"
    assert fields["mittente[cognomenome]"] == "Rosa mistretta"
    assert fields["metodo_pagamento"] == "bonifico"
    assert fields["serviziAggiuntivi[9]"] == "1"
    assert "serviziAggiuntivi[1]" not in fields
    assert fields["fascia_oraria_ritiro"] == "14-18"
    assert fields["note"] == "test"


def test_parse_offers_reports_empty_result():
    offers, message = parse_offers(EMPTY_OFFERS_HTML)
    assert offers == []
    assert message is not None and "Nessuna offerta" in message


def test_parse_label_groups():
    groups = parse_label_groups(LABEL_GROUPS_HTML)
    assert [g.id for g in groups] == ["12", "13"]
    assert groups[0].name == "POSTE DELIVERY"


def test_parse_quotes():
    quotes = parse_quotes(QUOTES_HTML)
    assert len(quotes) == 1
    assert quotes[0].carrier == "GLS"
    assert quotes[0].status == "In attesa"
    assert quotes[0].price is not None and quotes[0].price.amount == Decimal("8.00")


def test_parse_rate_lists_reads_cell_ids():
    rates = parse_rate_lists(RATES_HTML)
    assert len(rates) == 1
    assert rates[0].id == "38879"
    assert rates[0].name == "BRT (31)"
    assert rates[0].valid_to == "2999-01-01"


def test_parse_invoices_extracts_pdf_link():
    invoices = parse_invoices(INVOICES_HTML)
    assert len(invoices) == 1
    assert invoices[0].number == "4249-A"
    assert invoices[0].amount is not None and invoices[0].amount.amount == Decimal("9.29")
    assert invoices[0].pdf_url == "/stampafattura/aWRGYXR0dXJhPTQyOTM="


def test_parse_address_book():
    entries = parse_address_book(ADDRESS_BOOK)
    assert len(entries) == 1
    assert entries[0].party.name == "Alessio rosselli"
    assert entries[0].party.postal_code == "90086"
    assert entries[0].kind == "Mittente"
    assert entries[0].id == "aWQ9OTY0Nw=="
    # Gli endpoint di scrittura vogliono l'id numerico, non il token.
    assert entries[0].numeric_id == "9647"


def test_parse_account_anagrafica():
    data = parse_account_anagrafica(ACCOUNT_ANAGRAFICA_HTML)
    assert data["id"] == "634"
    assert data["ragione_sociale"] == "FRANCESCO GIULIANO"
    assert data["email"] == "alessio.rosselli97@gmail.com"
    assert parse_account_anagrafica_id(ACCOUNT_ANAGRAFICA_HTML) == "634"
