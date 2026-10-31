# TravelBox Contorno — connettore API non ufficiale

Risposta operativa alla domanda: *«il portale non ha API, ma posso usarlo: come
gli costruiamo sopra una nostra API, con i campi mappati?»*.

Questo repository contiene:

1. l'analisi delle soluzioni di mercato (§3),
2. l'architettura consigliata (§4),
3. un **proof of concept funzionante**: letture, preventivo, creazione in due
   fasi ed etichette PDF (§6).

---

## 1. Esito della verifica live (18/10/2026)

| Verifica | Esito |
|---|---|
| Stack | nginx + PHP 8.3.35 su Plesk, sessione `PHPSESSID` |
| Login | `POST /auth` (AJAX, JSON) con `csrf_token` + `userid` + `password` → `{"success":true,"redirect":"/nuovaspedizione"}` |
| API pubblica/documentata | **Assente** |
| Endpoint interni usati dal frontend | **Presenti** (JSON e frammenti HTML) |
| Anti-bot / CAPTCHA | Nessuno rilevato su login e liste |
| Spedizioni | **88** nell'anno corrente, con dettaglio completo |
| Dettaglio | `GET /vedispedizione/{token}`: mittente, destinatario, colli, vettore, tracking, costi, ritiro |
| Etichette | `GET /downloadfile/{token}` → **PDF 130.178 byte, 1 pagina** verificato |
| Listini | 29 |
| Fatture | 61 (con PDF `/stampafattura/...`) |
| Rubrica | 92 anagrafiche |
| Gruppi etichette | 4 (Bartolini, FedEx, UPS, Poste) |
| Offerte | **7** sulla tratta Camporeale→Rieti (1 collo 20 kg 40×40×40), da € 8,86 |
| Creazione | `POST /inseriscispedizione` con `metodo_pagamento=carrello` → **TBC-33948 in carrello** (nessun pagamento) |

Conclusione: **non serve partire dal browser automation**. Il portale è un'app
PHP server-rendered che espone già gli stessi endpoint usati dal suo frontend.
Un client HTTP con sessione e CSRF copre letture, preventivo, creazione in
carrello ed etichette, con costi e fragilità molto più bassi di Playwright.

### Endpoint interni osservati

| Metodo | Path | Risposta | Uso |
|---|---|---|---|
| GET | `/login` | HTML + `csrf_token` | avvio sessione |
| POST | `/auth` | JSON | login |
| POST | `/lemiespedizioni_filter` | HTML (tabella) | elenco spedizioni, filtri e paginazione |
| POST | `/lemiequotazioni_filter` | HTML (tabella) | elenco quotazioni |
| GET | `/lemiespedizioni` | HTML | tabella iniziale + select gruppi etichette |
| GET | `/vedispedizione/{token}` | HTML | dettaglio spedizione |
| POST | `/getcomuni` | JSON `{idcomune, nome, provincia}` | risolve CAP/città nell'id usato nei cookie |
| POST | `/mostraofferte` | HTML | preventivi corrieri (legge i cookie del form) |
| GET | `/creaspedizione/{token}` | HTML | preview del form di conferma offerta |
| POST | `/inseriscispedizione` | redirect | crea la spedizione (multipart, 69 campi) |
| GET | `/ilmiocarrello` | HTML | spedizioni create e non pagate |
| POST | `/scaricaetichette` | JSON | disponibilità/richiesta etichette |
| POST | `/uniscietichette` | JSON `{success, param}` | merge etichette → token PDF |
| GET | `/downloadfile/{token}` | PDF | download etichetta/allegato |
| GET | `/listini` | HTML | 29 listini |
| GET | `/elencofatture` | HTML | 61 fatture |
| POST | `/mittentidestinatarilist` | JSON `{success, html}` | rubrica (92) |
| POST | `/setanagrafica` | JSON | aggiornamento anagrafica |
| POST | `/controllanotifiche` | JSON | notifiche |

**Token**: sono base64 di query string. Esempio:
`aWRzcGVkaXppb25lPTMzNjgy` → `idspedizione=33682`. Il token offerta contiene
anche `idlistino`, `iddettaglio` e il JSON `offerta` (corriere, prezzi, note).
Il dettaglio accetta **solo** il token, non l'id numerico. Il token etichetta
può contenere `=`: va passato grezzo, **non** percent-encoded (altrimenti 400).

---

## 2. Il problema, in una frase

Il portale è un **sistema di record senza contratto macchina**. Bisogna
costruire un *adapter* che: (a) si autentica, (b) estrae, (c) normalizza su uno
schema canonico, (d) espone un'API stabile e documentata, (e) avvisa quando il
portale cambia. Le soluzioni di mercato coprono questi cinque strati in modi
diversi.

---

## 3. Soluzioni di mercato

### 3.1 Reverse engineering degli endpoint interni (consigliata)

Si osserva ciò che il browser già chiama e lo si richiama direttamente.

| Strumento | Ruolo |
|---|---|
| Chrome DevTools → Network → *Copy as cURL* | scoprire richieste, header, payload |
| [mitmproxy](https://github.com/mitmproxy/mitmproxy) | intercettare traffico anche da mobile/app |
| [curlconverter](https://github.com/curlconverter/curlconverter) | cURL → Python/Node/Go |
| [Bruno](https://github.com/usebruno/bruno) / Postman / Insomnia | esplorare e congelare le chiamate |
| FastAPI / NestJS | generare OpenAPI dal client |

**Pro**: velocissimo, economico, nessun browser da mantenere.
**Contro**: si dipende da endpoint non contrattualizzati; possono cambiare senza preavviso.

### 3.2 Browser automation (fallback per i flussi JavaScript)

| Strumento | Note |
|---|---|
| [Playwright](https://github.com/microsoft/playwright) | standard de facto; `codegen`, `storage_state`, PDF/screenshot, attese affidabili |
| [Puppeteer](https://github.com/puppeteer/puppeteer) | ottimo se il team è Node |
| [Selenium](https://github.com/SeleniumHQ/selenium) | maturo, più lento e più fragile |
| [patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) / [nodriver](https://github.com/ultrafunkamsterdam/nodriver) / [undetected-chromedriver](https://github.com/ultrafunkamsterdam/undetected-chromedriver) | solo se compare anti-bot; qui **non necessario** |
| [playwright-stealth](https://github.com/AtuboDad/playwright_stealth) | idem |

**Pro**: replica esattamente l'utente, gestisce JS, download etichette, modali.
**Contro**: RAM/CPU, latenza 3–10 s per flusso, selettori fragili, deploy più complesso.

### 3.3 RPA / low-code (se vuoi evitare codice)

| Piattaforma | Perché |
|---|---|
| [n8n](https://github.com/n8n-io/n8n) | self-host, nodi HTTP Request + HTML Extract + Schedule + Code; il miglior compromesso |
| [Activepieces](https://github.com/activepieces/activepieces) | open source, simile a Zapier |
| [Windmill](https://github.com/windmill-labs/windmill) | script Python/TS schedulati con UI |
| [Huginn](https://github.com/huginn/huginn) | agenti di monitoraggio (storico, utile per watch) |
| Make / Zapier | veloci ma costosi e con limiti su HTML parsing |
| UiPath / Power Automate Desktop | RPA enterprise, overkill qui |

**Pro**: nessun deploy applicativo, scheduler e notifiche inclusi.
**Contro**: mapping e test versionabili sono più scomodi; debugging limitato.

### 3.4 Servizi gestiti di browser/scraping

| Servizio | Quando ha senso |
|---|---|
| [Apify](https://apify.com) (Actor + Scheduler + Dataset + Proxy) | se vuoi demandare esecuzione, proxy e scheduling |
| [Browserless](https://www.browserless.io) | Chrome headless in affitto, Playwright remoto |
| [ScrapingBee](https://www.scrapingbee.com) / ScrapingAnt | API di scraping con rendering JS |
| [Zyte API](https://www.zyte.com/zyte-api/) / [Oxylabs](https://oxylabs.io) / [Bright Data](https://brightdata.com) | scala, proxy, antibot (non necessario qui) |
| [Firecrawl](https://github.com/mendableai/firecrawl) | pagine pubbliche → markdown; **non** serve per aree loggate |

**Pro**: zero infrastruttura, scalano.
**Contro**: costi ricorrenti, i dati sensibili passano da terzi (GDPR), e il login
con credenziali tue su un servizio esterno è un rischio da valutare.

### 3.5 Framework per connettori / ETL

| Strumento | Nota |
|---|---|
| [Airbyte Python CDK](https://github.com/airbytehq/airbyte-python-cdk) | se l'obiettivo è sincronizzare verso un warehouse |
| [Meltano SDK](https://github.com/meltano/sdk) (Singer) | tap custom, scheduling e target pronti |
| [Pipedream](https://pipedream.com) components | code-first, eventi e webhook |
| [Nango](https://github.com/NangoHQ/nango) | utile per OAuth multi-tenant (qui non c'è OAuth) |
| Alumio / Cyclr / Tray.io / Merge.dev | iPaaS/unified API: potenti, costosi, pensati per integrazioni B2B |

**Pro**: scheduling, retry, logging, connector versionati.
**Contro**: molta impalcatura per un singolo portale; il parsing resta da scrivere.

### 3.6 Mapping e validazione dei campi

| Strumento | Ruolo |
|---|---|
| Pydantic v2 | schema canonico + validazione + serializzazione (usato qui) |
| marshmallow / cerberus | alternativa più datata |
| [pandera](https://github.com/unionai-oss/pandera) | validazione tabellare |
| dbt | trasformazioni post-carico, se i dati finiscono in un DB |
| Great Expectations | data quality e alert |

Il punto chiave: **il mapping deve essere dichiarativo**, in un file solo
(`travelbox/mapping.py`), con alias multipli per etichetta.

### 3.7 Confronto sintetico

| Soluzione | Costo iniziale | Manutenzione | Robustezza | Tempo al primo dato |
|---|---|---|---|---|
| HTTP + endpoint interni (questo repo) | basso | media | alta se il portale non cambia | ore |
| Playwright | medio | alta (selettori, browser) | alta sul JS, fragile sul DOM | 1–2 giorni |
| n8n | basso | media | media | ore |
| Apify / Browserless | medio (ricorrente) | bassa | alta | ore |
| Airbyte/Meltano | alto | media | alta | giorni |
| iPaaS enterprise | alto | bassa | alta | settimane |

**Raccomandazione**: HTTP-first con questo scheletro; Playwright solo se il
portale introduce JS obbligatorio o anti-bot.

---

## 4. Architettura consigliata

```
                    ┌────────────────────────────────────────────┐
 Portale  ◄──HTTP──►│ transport   httpx + PHPSESSID + CSRF       │
 (PHP)              │             retry, rate limit, relogin     │
                    └───────────────┬────────────────────────────┘
                                    │ HTML / JSON / PDF
                    ┌───────────────▼────────────────────────────┐
                    │ extraction  parser per etichetta di colonna│
                    │             token base64, input nominati   │
                    └───────────────┬────────────────────────────┘
                                    │ oggetti grezzi
                    ┌───────────────▼────────────────────────────┐
                    │ mapping     alias + modelli Pydantic       │
                    │             schema canonico versionato     │
                    └───────────────┬────────────────────────────┘
                                    │ oggetti canonici
                    ┌───────────────▼────────────────────────────┐
                    │ API         FastAPI + OpenAPI + cache TTL  │
                    │             read / quote / create / label  │
                    └───────────────┬────────────────────────────┘
                                    │
              scheduler (cron/n8n) ─┴─► DB/warehouse ─► BI / gestionale
```

Regole di progetto:

- **Un solo punto di verità per il mapping** (`mapping.py`).
- **Mai fidarsi degli indici di colonna**: usare le etichette.
- **Cache** per non martellare il portale (default 5 min).
- **Rate limit** client-side (0,8 s tra richieste) e retry con backoff.
- **Sessione persistita** su file `0600`; re-login automatico su redirect a `/login`.
- **Test offline** con fixture HTML reali: il parsing si valida senza toccare il portale.
- **Change detection**: un job giornaliero che verifica presenza di tabelle e
  header attesi e avvisa (email/Slack) se cambiano.
- **Scritture in due fasi**: preview di default, invio solo con `confirm=true`.

---

## 5. Field mapping

### Schema canonico (estratto reale, TBC-33682)

```json
{
  "id": "33682",
  "reference": "TBC-33682",
  "tracking_number": "3UW1L9L080507",
  "status": "TRASMESSA",
  "service": "Pacchi",
  "carrier": "POSTE DELIVERY BUSINESS EXPRESS 1",
  "created_at": "16/10/2026 11:28:05",
  "chargeable_weight_kg": 20.0,
  "pieces": 1,
  "packages": [
    {"pieces": 1, "weight_kg": 20.0, "width_cm": 40.0, "height_cm": 40.0, "length_cm": 40.0}
  ],
  "sender": {
    "name": "Rosa mistretta", "street": "Via Lorenzo perosi 38",
    "city": "Camporeale", "province": "PA", "postal_code": "90043",
    "country": "Italia", "email": "…", "phone": "3338086835", "kind": "Mittente"
  },
  "recipient": {
    "name": "Bonura Rossella", "street": "VIALE EUGENIO DUPRE THESEIDER 27",
    "city": "Rieti", "province": "RI", "postal_code": "02100",
    "country": "Italia", "email": "…", "phone": "3791296638", "kind": "Destinatario"
  },
  "price": {"amount": "8.86", "currency": "EUR", "formatted": "€ 8,86"},
  "payment_method": "Pagamento on line",
  "pickup_date": "19/10/2026",
  "label_token": "aWRhbGxlZ2F0bz00MTE4MyZpZHNwZWRpemlvbmU9MzM2ODI=",
  "label_url": "/downloadfile/aWRhbGxlZ2F0bz00MTE4MyZpZHNwZWRpemlvbmU9MzM2ODI=",
  "detail_url": "/vedispedizione/aWRzcGVkaXppb25lPTMzNjgy"
}
```

### Mapping lista (`/lemiespedizioni_filter`)

| Campo canonico | Sorgente | Note |
|---|---|---|
| `id` | `input[data-idspedizione]` | attributo, non testo |
| `reference` | testo `TBC-\d+` | |
| `created_at` | `\d{2}/\d{2}/\d{4} \d{2}:\d{2}` | la cella contiene anche riferimento e pagamento |
| `status` | 7ª colonna | |
| `price` | 6ª colonna (`Imp. Pagato`) | parsing `€ 1.234,56` |
| `tracking_url` | `onclick="trackingSpedizione('...')"` | |
| `tracking_number` | ultimo segmento dell'URL | Poste: `3UW1L9L080507` |
| `label_token` | `onclick="stampaEtichetta('...')"` | base64 |
| `detail_url` | `href="/vedispedizione/{token}"` | |
| `carrier` / `service` | — | nella lista sono loghi base64: si completano dal dettaglio |

### Mapping dettaglio (`/vedispedizione/{token}`)

| Campo canonico | Sorgente |
|---|---|
| `reference` | `Spedizione: TBC-…` |
| `created_at` | `Data e ora: …` |
| `chargeable_weight_kg` | `Peso tassabile: … kg` |
| `status` | `Stato: …` |
| `pieces` | `Totale colli: …` |
| `carrier` | `Vettore scelto: …` |
| `tracking_number` | `Tracking della spedizione: …` |
| `price` | `Costo spedizione: …` |
| `pickup_date` | `Data ritiro: …` |
| `packages[]` | righe `N: Colli: …, Peso: …, Larghezza: …, Altezza: …, Lunghezza: …` (decimali con virgola o punto) |
| `sender` | input `mittente[cognomenome]`, `[indirizzo]`, `[cap]`, `[localita]`, `[provincia]`, `[email]`, `[telefono]` |
| `recipient` | input `destinatario[...]` (stessi campi) |
| `label_token` | link `/downloadfile/…` con testo “Etichette” |

Le regex delle etichette di riepilogo stanno in `mapping.DETAIL_TEXT_PATTERNS`:
se il portale rinomina un campo, si cambia una riga.

### Perché gli alias e non un JSON Schema rigido

Il portale non ha versioning. Gli alias permettono di accettare sia
`Mitt./Dest.` sia `Mittente/Destinatario` senza toccare i modelli. I test
offline congelano il comportamento atteso; il campo `raw` permette di
ricostruire qualsiasi mapping perso.

---

## 6. Il proof of concept

### Avvio

```bash
cd travelbox-connector
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# credenziali in .env (già presente, non committare)
.venv/bin/python scripts/smoke.py

.venv/bin/uvicorn travelbox.api:app --reload --port 8000
# docs: http://127.0.0.1:8000/docs
```

### Endpoint esposti

| Endpoint | Descrizione |
|---|---|
| `GET /health` | stato login/sessione |
| `GET /shipments?page=&status=&tracking=&carrier=&date_from=&date_to=&refresh=` | spedizioni normalizzate |
| `POST /shipments/quote` | preventivo corrieri (nessuna scrittura) |
| `POST /shipments` | creazione in due fasi (`confirm=false` di default; `confirm=true` → carrello) |
| `GET /cart` | spedizioni non pagate (`IN CARRELLO`) |
| `GET /shipments/{id}` | dettaglio (accetta id, `TBC-…` o token) |
| `GET /shipments/{id}/label` | PDF etichetta |
| `POST /shipments/{id}/request-label` | richiesta preparazione etichette |
| `GET /label-groups` | gruppi corrieri per il merge |
| `POST /labels/merge` | unisce più etichette in un PDF |
| `GET /labels/{token}` | download diretto da token |
| `GET /quotes?page=&status=` | quotazioni |
| `GET /rates` | listini (29) |
| `GET /invoices` | fatture (61) con URL PDF |
| `GET /address-book` | rubrica (92) |

> Il portale mostra le spedizioni solo con un intervallo di date: la UI stessa
> parte con `data_dal`/`data_al` vuoti e 0 righe. Passa `date_from` e `date_to`
> per vedere lo storico (es. `2026-01-01` → `2026-12-31` = 88 spedizioni).

### Esempi

```bash
# elenco
curl "http://127.0.0.1:8000/shipments?date_from=2026-01-01&date_to=2026-12-31"

# dettaglio
curl "http://127.0.0.1:8000/shipments/33682"

# etichetta PDF
curl -OJ "http://127.0.0.1:8000/shipments/33682/label"

# preventivo verificato (7 offerte, nessuna scrittura)
curl -X POST http://127.0.0.1:8000/shipments/quote \
  -H "Content-Type: application/json" \
  -d '{
    "sender_id":"13562","recipient_id":"13563",
    "sender_city":"Camporeale","sender_cap":"90043","sender_province":"PA",
    "recipient_city":"Rieti","recipient_cap":"02100","recipient_province":"RI",
    "packages":[{"pieces":1,"weight_kg":20,"width_cm":40,"height_cm":40,"length_cm":40}]
  }'

# creazione: prima preview (confirm=false), poi carrello (confirm=true, no pagamento)
curl -X POST http://127.0.0.1:8000/shipments \
  -H "Content-Type: application/json" \
  -d '{"draft":{...},"offer_id":"214424","confirm":false}'

# merge etichette
curl -X POST http://127.0.0.1:8000/labels/merge \
  -H "Content-Type: application/json" \
  -d '{"shipment_ids":[33682],"group_id":"9"}' -o etichette.pdf
```

### Flusso di scrittura (due fasi)

Il form del portale non fa un POST diretto: salva indirizzi e colli in due
cookie (`datiSpedizioneCompleta`, `datispedizione`), poi chiama
`POST /mostraofferte` e mostra la tabella delle offerte. Ogni riga ha un link
`creaspedizione/{token}` che apre la preview del form di conferma; il submit
vero è un multipart `POST /inseriscispedizione`.

```
quote(draft)
  ├─ POST /getcomuni (CAP + città → idcomune numerico)   ← necessario
  ├─ cookie ambito/datispedizione/datiSpedizioneCompleta
  ├─ POST /mostraofferte
  └─ parse_offers → Offer[] (7 offerte, da € 8,86)
create_shipment(draft, offer_id, confirm=False)
  ├─ confirm=False → preview, nessuna scrittura
  └─ confirm=True  → GET creaspedizione/{token}
                     → parse_booking_form (69 campi)
                     → metodo_pagamento=carrello (sovrascrive bonifico)
                     → POST /inseriscispedizione
                     → GET /ilmiocarrello → stato "IN CARRELLO"
                     (nessun endpoint di pagamento viene chiamato)
```

Tre dettagli non ovvi, verificati sul portale:

- `datiSpedizioneCompleta.partenza.stato` vuole il **codice paese** (`IT`), non
  `Italia`; `localita` vuole l'**idcomune numerico** (`82019`), non il nome.
  Con il nome il portale risponde “Nessuna offerta disponibile”.
- `mittente[id]` e `destinatario[id]` nel form `/inseriscispedizione` vogliono
  l'**id numerico** (`13563`), non il token base64 della rubrica
  (`aWQ9MTM1NjM=`). Con il token il portale risponde HTTP 500 e crea righe
  vuote in rubrica. `parsers.numeric_id()` fa la conversione; la creazione del
  destinatario richiede anche `anagrafica_id`.
- Il form di conferma preseleziona `metodo_pagamento=bonifico`: il connettore
  lo sostituisce **sempre** con `carrello`. Per completare l'acquisto serve un
  passo di pagamento separato, che questo codice non implementa.

### Mapping offerte (`/mostraofferte`)

| Campo canonico | Sorgente |
|---|---|
| `carrier` | JSON `offerta.corriere` (fallback `img[alt]`) |
| `net_price` | colonna `Prezzo` |
| `tax` | colonna `Iva` |
| `price` | colonna `Totale` (ivato) |
| `weight_kg` | colonna `Peso tassato` / `offerta.peso` |
| `list_id` | `offerta.idlistino` |
| `detail_id` | `offerta.iddettaglio` |
| `book_url` | `href` del link “Prenota” (`creaspedizione/{token}`) |
| `service` | prima riga non vuota di `offerta.notes` |

### Etichette

| Operazione | Endpoint portale | Verifica |
|---|---|---|
| token dalla riga | `stampaEtichetta('…')` | ✅ |
| token dal dettaglio | link “Scarica Etichette” | ✅ |
| download PDF | `GET /downloadfile/{token}` | ✅ 130.178 byte, 1 pagina |
| richiesta etichette | `POST /scaricaetichette` | implementato, non eseguito |
| merge | `POST /uniscietichette` + `downloadfile` | implementato, non eseguito |

Il merge è stato ricostruito dal JS della pagina (`spedizioniEtichette[]` +
`id_gruppo_corrieri`) ma **non** eseguito per non generare un PDF reale
sull'account. La validazione di input è testata.

### Struttura

```
travelbox/
  config.py     env + parametri (timeout, rate limit, cache)
  client.py     login, CSRF, cookie, retry, quote, create, labels
  parsers.py    HTML/JSON -> modelli (etichette, token, input nominati)
  mapping.py    alias e regex dei campi (unico punto da manutenere)
  models.py     schema canonico + draft/offer/label
  api.py        FastAPI + OpenAPI + cache TTL
scripts/smoke.py    test live di sola lettura + preventivo
tests/test_parsers.py  15 test offline su markup reale (offerte e carrello inclusi)
```

### Verifiche eseguite

```text
pytest ......................... 15 passed
smoke live ..................... login OK, 29 listini, 61 fatture, 92 anagrafiche
GET /shipments (2026) .......... 88 righe
GET /shipments/33682 ........... TBC-33682, POSTE DELIVERY BUSINESS EXPRESS 1
GET /shipments/33682/label ..... PDF 130.178 byte
GET /label-groups .............. 4 gruppi
GET /cart ...................... TBC-33948, 8,86 €, IN CARRELLO
POST /shipments/quote .......... 7 offerte (POSTE 8,86 / BRT 10,69 / FedEx 11,22 …)
POST /shipments (confirm=false)  preview con offerta 214424, nessuna scrittura
POST /inseriscispedizione ...... TBC-33948 creata, metodo_pagamento=carrello
GET /labels/{token} ............ PDF 130.178 byte
POST /labels/merge (vuoto) ..... 422 di validazione, nessuna chiamata upstream
compileall ..................... OK
```

---

## 7. Rischi, limiti, sicurezza

- **Offerte**: la tratta Camporeale→Rieti (1 collo 20 kg 40×40×40) restituisce
  7 offerte; la più economica è POSTE a € 8,86. Il numero e i prezzi dipendono
  da listini, tratta e colli: `parse_offers` non inventa valori, se la tabella
  cambia restituisce 0 offerte e `create_shipment` fallisce con `NoOffers`.
- **Pagamento non implementato**: `confirm=true` aggiunge al carrello, non
  paga. Il credito residuo mostrato dal portale (€ 3,48) non copre € 8,86;
  completare l'ordine richiede una scelta esplicita tra carta, bonifico o
  contanti e va fatta manualmente o con un modulo di pagamento dedicato.
- **Doppia submit**: non c'è idempotency key lato portale. Due `confirm=true`
  creano due spedizioni in carrello; l'applicazione deve deduplicare.
- **Merge etichette non eseguito**: implementato dall'JS, evitato per non
  generare un PDF reale. Da provare quando c'è un gruppo corrieri valido.
- **Token**: base64 con `=`; va passato grezzo. Se percent-encoded → HTTP 400.
- **Date**: senza `date_from`/`date_to` il portale restituisce 0 righe (è il
  comportamento della sua UI, non un bug del connettore).
- **Autorizzazione**: usare solo account propri e nei limiti del contratto/ToS.
- **Fragilità**: gli endpoint interni non sono un contratto. Mitigazioni: alias,
  test con fixture, change detection, `raw` sempre conservato.
- **Credenziali**: in `.env` locale (in chiaro per il test, come richiesto),
  `.gitignore` esclude `.env` e `.session.json`. In produzione usare un secret
  manager e un utente di servizio dedicato.
- **GDPR**: mittenti/destinatari e fatture sono dati personali. Se il connettore
  passa da un servizio terzo (Apify, Browserless), verificare il trattamento e
  preferire self-host.
- **Rate limit**: 0,8 s tra richieste e cache. Non parallelizzare le letture.
- **Scritture**: `confirm=false` è il default; `metodo_pagamento` è forzato a
  `carrello`; nessun pagamento automatico. Per completare l'acquisto serve un
  passo separato e autorizzato esplicitamente.
- **MFA**: assente oggi; se venisse introdotta, serve Playwright con sessione
  interattiva o un flusso di consenso.

---

## 8. Prossimi passi suggeriti

1. **Completare TBC-33948**: scegliere il metodo di pagamento (carta, bonifico
   o contanti) e completare il checkout dal portale. Il connettore si ferma
   prima, per non addebitare nulla senza conferma.
2. **Testare il merge etichette** su due spedizioni reali dello stesso gruppo.
3. **Scheduler + storage**: job ogni 15 min → Postgres/SQLite, così l'API legge
   dal DB e il portale viene interrogato una volta sola.
4. **Webhook/eventi**: notifiche su cambio stato spedizione.
5. **Osservabilità**: log strutturati, metriche, alert su parse falliti.
6. **Se si vuole zero codice**: replicare `client.py` in n8n (HTTP Request +
   HTML Extract + Schedule) usando gli stessi endpoint e lo stesso mapping.
