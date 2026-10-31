# MUVPACK — Courier Shipping Platform

Piattaforma B2B per spedizioni con Poste Italiane, BRT e DHL: preventivo multi-corriere, portafoglio prepagato, lettere di vettura PDF, tracking, rubrica destinatari, ticket di assistenza e area super admin.

## Struttura

- Root: frontend React 19 + Vite + Tailwind 4
- `backend/`: API FastAPI + SQLAlchemy (SQLite in locale, PostgreSQL su Render)
- `render.yaml`: Blueprint con frontend static site, API web service e database Postgres

## Deploy su Render (tutto in un click)

1. Apri https://render.com/deploy?repo=https://github.com/rosselli97/courier-shipping-platform
2. Autorizza il repository e conferma il Blueprint.
3. Render crea:
   - `muvpack-api` → https://muvpack-api.onrender.com
   - `muvpack-web` → https://muvpack-web.onrender.com
   - `muvpack-db` (Postgres free)

Se Render assegna nomi diversi (perché gia occupati), aggiorna in `render.yaml`:
- `VITE_API_BASE` del sito statico con l'URL pubblico della API
- `CORS_ORIGINS` della API con l'URL pubblico del sito
poi rilancia il Blueprint.

Il database free di Render scade 30 giorni dopo la creazione: per uso continuativo passa a un piano a pagamento o usa un Postgres esterno.

## Sviluppo locale

Frontend:

```powershell
npm install
npm run dev
```

Backend (porta 8001, il frontend inoltra `/api` con il proxy Vite):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

## Variabili principali

Frontend (build time):

```
VITE_API_BASE=https://muvpack-api.onrender.com
```

Backend:

```
MUVPACK_SECRET_KEY=...
MUVPACK_DATABASE_URL=postgresql://...
MUVPACK_COOKIE_SECURE=1
MUVPACK_SESSION_SAMESITE=none
CORS_ORIGINS=https://muvpack-web.onrender.com
```

## TravelBox Connector

Il connettore non ufficiale al portale TravelBox Contorno è incluso in `backend/travelbox/` ed esposto dall'API sotto `/api/travelbox/*` (solo super admin, oppure header `X-TravelBox-Key`).

- `GET /api/travelbox/health`
- `GET /api/travelbox/shipments?date_from=2026-01-01&date_to=2026-12-31`
- `POST /api/travelbox/shipments/quote`
- `POST /api/travelbox/shipments` (`confirm=false` di default)
- `GET /api/travelbox/shipments/{id}` e `/label`
- `GET /api/travelbox/cart`, `/rates`, `/invoices`, `/address-book`
- `POST /api/travelbox/labels/merge`

Variabili backend:

```
TRAVELBOX_BASE_URL=https://www.travelboxcontorno.it
TRAVELBOX_USERID=...
TRAVELBOX_PASSWORD=...
TRAVELBOX_MIN_INTERVAL=0.8
TRAVELBOX_CACHE_TTL=300
TRAVELBOX_SESSION_FILE=/tmp/travelbox-session.json
```

Test offline: `cd backend && python -m pytest tests`.

## Account demo

| Ruolo | Email | Password |
|---|---|---|
| Super admin | `admin@muvpack.it` | `Admin123!` |
| Rivenditore | `reseller@muvpack.it` | `Reseller123!` |

Tracking demo: `MVP20260001`.

## Note

- Il backend in `backend/` è una ricostruzione compatibile con il frontend; le tariffe corrieri sono valori demo.
- Stripe e SMTP sono opzionali: senza chiavi il checkout è simulato e le email risultano inviate senza invio reale.
