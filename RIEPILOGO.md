# MUVPACK — Riepilogo del lavoro

Data: 31 ottobre 2026

## 1. Obiettivo

Ricostruire l'applicazione MUVPACK partendo dall'anteprima Emergent, portarla su un repository GitHub e pubblicarla su Render, integrando il connettore TravelBox per preventivi reali e creazione delle spedizioni nel carrello del portale.

## 2. Repository e frontend

- Repository: `https://github.com/rosselli97/courier-shipping-platform`
- Cartella locale: `C:\Users\Giuseppe\Desktop\courier-shipping-platform`
- Il vecchio mockup Figma è stato sostituito con il frontend completo React 19 + Vite + Tailwind 4.
- Il codice originale è stato ricostruito dall'anteprima Emergent leggendo i sourcemap di Vite e i file raw (`?raw`), poi pulendo `index.html`, `vite.config.ts`, `tsconfig` e asset brand.
- Pagine: Home, calcolatore, scelta corriere, tracking, login/signup, dashboard rivenditore, area admin, rubrica, assistenza, nuova spedizione, spedizioni.
- Componenti UI: shadcn/base-ui, tabelle, dialog, portafoglio, grafici, etichette PDF, ticket.
- Il deploy Vercel è stato abbandonato in favore di Render.

## 3. Backend FastAPI

Ricostruito in `backend/`:

- Autenticazione a cookie httpOnly (`muvpack_session`), ruoli `admin` / `reseller`.
- Database SQLAlchemy: SQLite in locale, PostgreSQL su Render.
- Modelli: utenti, spedizioni, tracking, portafoglio, contatti, ticket, markup, tariffe pallet, pagamenti.
- API: auth, quote, tracking, contacts, reseller, admin, payments, tickets, PDF etichette, estratti conto PDF/XLSX.
- Seed demo con admin, rivenditori, spedizioni, tracking, rubrica, ticket e movimenti.
- Tariffe locali demo per Poste/BRT/DHL, markup e supplemento carburante.
- Etichette PDF e statement generati con reportlab/openpyxl.
- Stripe opzionale (senza chiave il checkout è simulato).
- SMTP opzionale (senza SMTP le email risultano inviate).

## 4. Deploy Render

Blueprint `render.yaml` con:

- `muvpack-api` — FastAPI (Python 3.12.11, Frankfurt, free)
- `muvpack-web` — frontend static site (Vite)
- `muvpack-db` — PostgreSQL 16 free (Frankfurt)

URL live:

- App: https://muvpack-web.onrender.com
- Login: https://muvpack-web.onrender.com/login
- Admin: https://muvpack-web.onrender.com/admin
- API health: https://muvpack-api.onrender.com/api/health

Correzioni applicate in deploy:

- forzato dialetto `postgresql+psycopg2://` per SQLAlchemy 2.1;
- retry connessione DB all'avvio;
- start command `python -m uvicorn ...`;
- cookie cross-site `SameSite=None; Secure`;
- CORS per `*.onrender.com`;
- variabili TravelBox impostate su Render (credenziali fuori dal repo).

## 5. Integrazione TravelBox

Connettore non ufficiale incluso in `backend/travelbox/` (client, parser, mapping, modelli, API).

- Endpoint montati sotto `/api/travelbox/*` (admin-only, oppure `X-TravelBox-Key`).
- Credenziali e sessione TravelBox gestite via env Render; `.env` e `.session.json` non vengono committati.
- Test offline del connettore: 15 test superati.

### Preventivi reali

- `POST /api/quote` usa gli stessi campi MUVPACK: CAP partenza/destinazione, peso, dimensioni, pallet.
- Per utenti autenticati restituisce le offerte reali TravelBox; gli anonimi vedono le tariffe demo.
- Mapping offerte TravelBox → card corriere MUVPACK, con badge TravelBox e IVA inclusa.
- Mittente ricavato dall'account TravelBox; destinazione dai CAP MUVPACK.
- Cache TTL delle offerte e fallback alle tariffe demo se TravelBox non risponde.

### Creazione spedizione

- `POST /api/travelbox/checkout` (admin/rivenditori).
- Il dialog si apre **dopo la scelta del corriere** e contiene gli stessi campi del portale:
  - Dati mittente: nome/ragione sociale, indirizzo, email, telefono (precompilati dall'account TravelBox).
  - Dati destinatario: nome/ragione sociale, indirizzo, email, telefono, contatto.
  - Dettagli spedizione: descrizione beni, data ritiro, fascia oraria.
- Il backend crea o trova il destinatario nella rubrica TravelBox, poi invia il form di conferma con `metodo_pagamento=carrello` (nessun pagamento automatico).
- La creazione del destinatario passa `anagrafica_id` (ricavato dal dettaglio mittente o da `/latuaanagrafica`); la rubrica espone token, ma il form di conferma vuole gli id numerici, quindi il connettore li converte.
- Dopo la creazione, MUVPACK registra una spedizione locale con `tracking_code = TBC-...`, owner = utente e un evento di tracking: compare subito in **Spedizioni effettuate** (admin) o **Le tue spedizioni** (rivenditore). Per queste righe il PDF etichetta locale è disabilitato: l'etichetta si scarica dal portale TravelBox.
- `POST /api/travelbox/import-history` (admin) importa a blocchi lo storico TravelBox nell'elenco MUVPACK; salta annullate/rifiutate e spedizioni già presenti.
- Storico 2026 importato in produzione: **102 spedizioni TravelBox** (oltre alle 2 spedizioni locali già presenti), visibili in **Spedizioni effettuate** con badge TravelBox.
- `POST /api/travelbox/import-address-book` (admin) importa la rubrica TravelBox (mittenti e destinatari) nella rubrica MUVPACK, saltando duplicati e voci incomplete. Il primo import usava l'account configurato su Render (rubrica diversa da quella delle spedizioni) ed è stato annullato; la rubrica corretta è quella dell'account `alessio.rosselli97@gmail.com`, da cui sono stati importati **94 contatti** (mittenti + destinatari). Le 97 voci del primo import sono state eliminate.
- In caso di errore il destinatario temporaneo viene rimosso.
- Il controllo sul credito residuo è stato **rimosso** su richiesta: MUVPACK non blocca più la creazione per credito.

### Sincronizzazione TravelBox ↔ MUVPACK

- `POST /api/travelbox/sync` (admin) allinea stato e etichette; le liste spedizioni lo eseguono automaticamente con TTL di 2 minuti.
- Se una spedizione viene rimossa dal carrello TravelBox (stato `ANNULLATA`), il sync elimina anche il record locale: sparisce da MUVPACK.
- `DELETE /api/admin/shipments/{id}` e `DELETE /api/reseller/shipments/{id}` per le spedizioni TravelBox in stato `creata`: rimuovono la spedizione dal carrello TravelBox e dal database MUVPACK.
- Quando la spedizione viene pagata/trasmessa su TravelBox, il sync salva il token etichetta e il pulsante PDF scarica la **lettera di vettura reale** da TravelBox.
- Aggiunta la colonna `shipments.label_token` con migrazione automatica all'avvio (Postgres/SQLite).

### Cosa vuole TravelBox per creare la spedizione

- **Mittente**: `mittente[id]` **numerico** della rubrica, più `cognomenome`, `indirizzo`, `email` (obbligatoria), `telefono` (min. 8 cifre), `contatto`; `codice_fiscale`/`partita_iva` opzionali.
- **Destinatario**: `destinatario[id]` **numerico** se già in rubrica. Se è nuovo, va creato prima con `/mittentidestinatari_create` passando `anagrafica_id` (l'anagrafica dell'account), poi si usa l'id numerico restituito.
- **Dettagli**: `descrizione_beni` (max 25 caratteri), `data_ritiro` in formato `YYYY-MM-DD` (minimo il giorno dopo, massimo ~10 giorni), `fascia_oraria_ritiro` tra `9-12`, `12-15`, `15-18`, `18-21`.
- **Offerta e totali**: `idlistino`, `idcorriere`, `prezzoIngresso`, `jsonCatenaMarkup`, `totale_spedizione*`, `supplementi`, `credito_residuo` arrivano già compilati dalla preview `creaspedizione/{token}`: vanno rimandati così come sono.
- **Ritiro**: `indirizzo_ritiro`, `cap_ritiro`, `citta_ritiro`, `provincia_ritiro`, `telefono_ritiro`, `email_ritiro`, `ragione_sociale_ritiro`, `nome_completo_ritiro` sono precompilati dall'account.
- **Pagamento**: `metodo_pagamento=carrello` per aggiungere al carrello senza pagare (il form preseleziona `bonifico`).

### Debug e log

- `POST /api/travelbox/preview` restituisce i controlli del form TravelBox con `required`, `visible`, valori e opzioni (endpoint admin).
- Log su Render per ogni submit: payload dei campi principali, stato HTTP, header e body della risposta.
- Il `500` con body vuoto (`PHP/8.3.36`, `content-length: 0`) era causato dagli **id della rubrica passati come token base64** (`aWQ9MTM1NjM=`) invece che come **id numerici** (`13563`). Il portale, con il token, crea righe vuote in rubrica e poi va in errore su `/inseriscispedizione`.
- Il form di conferma usa `mittente[id]` / `destinatario[id]`: vanno sempre inviati gli id numerici. `parsers.numeric_id()` converte i token (`id=...`) nell'id numerico; il client lo applica sia in creazione sia in `find_recipient`.
- La creazione del destinatario in rubrica (`/mittentidestinatari_create`) richiede inoltre `anagrafica_id` (l'anagrafica dell'account, es. `634`): senza quel campo il portale risponde `400`.
- Verificato con il flusso reale `create_travelbox_shipment`: spedizioni `TBC-40193`, `TBC-40194`, `TBC-40195` create e messe nel carrello con `metodo_pagamento=carrello`, poi rimosse dal carrello durante i test. Anche la creazione di un nuovo destinatario (con `anagrafica_id`) funziona.
- Le righe vuote create in rubrica dai tentativi falliti sono state eliminate; la rubrica e il carrello sono stati ripuliti.

## 6. UI e iterazioni

- Inizialmente creata una pagina TravelBox separata (rubrica, preventivi, carrello, etichette).
- Su richiesta, la sezione TravelBox autonoma è stata **rimossa**: i prezzi e la creazione sono nel flusso MUVPACK.
- Tentata una nuova sidebar admin con voci Panoramica/Spedizioni/Corrieri/Clienti B2B/Regole di ricarico/Fatture/Impostazioni.
- Su richiesta, la sidebar admin è stata **riportata alla versione precedente**.
- La card **“Serve aiuto?”** è stata creata **solo per i clienti B2B/rivenditori**, sopra il profilo utente; l'admin non la mostra.
- Il dialog di creazione dopo la scelta del corriere mostra i campi mittente/destinatario e i dettagli spedizione.
- Aggiunto il campo **Colli** (1-100) nel form di nuova spedizione: entra nel peso volumetrico (`L×P×A×colli/5000`), nel preventivo TravelBox (`pieces`) e nel prezzo pallet (tariffa × colli).
- Il CAP nel form interroga `GET /api/geo/comuni` e fa selezionare il comune; CAP + comune viaggiano nel preventivo (`origin_city`/`dest_city`) e vengono mostrati nel dialog di creazione spedizione.
- Nel dialog di creazione mittente/destinatario partono vuoti; il nome è autocompletato dalla rubrica: mittente filtrato per CAP di partenza, destinatario su tutta la rubrica (prima i contatti del CAP di destinazione, gli altri con l'indicazione "CAP diverso"); selezionando il contatto si compilano nome, indirizzo, email (e contatto mittente). I CAP con i comuni scelti restano visibili nelle testate e in campi CAP/Paese non modificabili.

## 7. Account demo

| Ruolo | Email | Password |
|---|---|---|
| Super admin | `admin@muvpack.it` | `Admin123!` |
| Rivenditore | `reseller@muvpack.it` | `Reseller123!` |

Tracking demo: `MVP20260001`.

## 8. Sicurezza e note

- `.env`, `.session.json`, `.venv`, database locale e cache Python sono esclusi dal repository.
- Le credenziali TravelBox sono nelle env di Render, non nel repository.
- La Render API key condivisa in chat va revocata/ruotata.
- Il connettore TravelBox usa endpoint interni non documentati: può rompersi se il portale cambia; usare solo account propri e nel rispetto dei ToS.
- Il database free Render scade dopo 30 giorni; per uso continuativo serve un piano a pagamento o un Postgres esterno.

## 9. Stato attuale e prossimi passi

Funzionante:

- Frontend MUVPACK live su Render.
- Login, dashboard admin/rivenditore, tracking, rubrica, ticket, portafoglio, PDF.
- Preventivi reali TravelBox per utenti autenticati.
- Dialog di creazione completo con tutti i campi del portale.
- Log e endpoint di ispezione del form TravelBox.
- Creazione della spedizione nel carrello TravelBox (`metodo_pagamento=carrello`, nessun pagamento) con id numerici, `anagrafica_id` per la rubrica e pulizia del destinatario temporaneo in caso di errore.

Risolto:

- Il vecchio HTTP 500 su `/inseriscispedizione` non era un errore del portale: il connettore inviava i token base64 della rubrica al posto degli id numerici. Ora `parsers.numeric_id()` normalizza `mittente[id]` e `destinatario[id]`, e `create_recipient()` invia `anagrafica_id`.
- Non è presente alcun blocco credito lato MUVPACK.

Prossimi passi consigliati:

1. Verificare il download etichetta e il completamento del checkout sul portale per una spedizione creata da MUVPACK.
2. Impostare su Render `TRAVELBOX_SENDER_ID` con l'id **numerico** di un mittente valido della rubrica (es. `9647` o `13562`); se assente, il connettore sceglie un mittente con la stessa email dell'anagrafica dell'account, altrimenti il primo mittente con nome e indirizzo validi.
3. Aggiungere un test di integrazione che verifichi `mittente[id]`/`destinatario[id]` numerici nel payload di `/inseriscispedizione`.
4. Eventualmente sostituire/estendere il connettore con un account o flusso autorizzato da TravelBox.
