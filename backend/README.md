# MUVPACK — Backend FastAPI (ricostruito)

Ricostruzione del backend a partire dal frontend nella root del repository.
Espone le stesse rotte `/api/*` usate dal frontend, con autenticazione a cookie httpOnly, SQLite e seed demo.

## Avvio

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001
```

Se manca la venv:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Il database `muvpack.db` viene creato e popolato al primo avvio. API docs su `http://localhost:8001/docs`.

## Frontend

```powershell
cd muvpack-source
npm install
npm run dev
```

Vite gira su `http://localhost:3000` e inoltra `/api` a `http://localhost:8001` (gia configurato in `vite.config.ts`).

## Account demo

| Ruolo | Email | Password |
|---|---|---|
| Super admin | `admin@muvpack.it` | `Admin123!` |
| Rivenditore | `reseller@muvpack.it` | `Reseller123!` |
| Rivenditore | `bianchi@muvpack.it` | `Reseller123!` |
| Rivenditore sospeso | `verdi@muvpack.it` | `Reseller123!` |

Tracking demo: `MVP20260001`.

## Rotte implementate

- `POST /api/auth/login`, `POST /api/auth/signup`, `POST /api/auth/logout`, `GET /api/auth/me`
- `POST /api/quote`
- `GET /api/tracking/{code}`
- `GET/POST /api/contacts`, `PUT/DELETE /api/contacts/{id}`
- `GET /api/reseller/summary`, `GET/POST /api/reseller/shipments`
- `GET /api/reseller/shipments/{id}/label`, `GET /api/reseller/labels?ids=...`
- `GET /api/reseller/wallet/transactions`, `GET /api/reseller/wallet/statement?month=YYYY-MM&format=pdf|xlsx`
- `POST /api/payments/checkout`, `GET /api/payments/status/{session_id}`
- `GET/POST /api/tickets`, `GET /api/tickets/{id}`, `POST /api/tickets/{id}/messages`, `PATCH /api/tickets/{id}/status`
- `GET /api/admin/kpis`, `GET/POST /api/admin/clients`
- `PATCH /api/admin/clients/{id}/status`, `POST /api/admin/clients/{id}/wallet`
- `GET/PUT /api/admin/clients/{id}/markup`
- `GET/PUT /api/admin/markup-rules`, `GET/PUT /api/admin/pallet-rates`
- `GET/POST /api/admin/shipments`, `GET /api/admin/shipments/{id}/label`, `GET /api/admin/labels?ids=...`

## Note sulla ricostruzione

- Il codice Python originale non era servito dall'anteprima (404 su `/api/*`). Questa versione deriva dai tipi in `src/lib/types.ts`, dalle chiamate in `src/lib/api.ts` e dalla logica visibile nei componenti.
- Le tariffe corrieri, il carburante e i ricavi del seed sono valori plausibili inventati: vanno sostituiti con quelli reali.
- Stripe è opzionale: senza `STRIPE_SECRET_KEY` il checkout è simulato e accredita subito il saldo.
- SMTP è opzionale: senza configurazione l'email di tracking viene marcata `sent` senza invio reale.
- Il tracking avanza automaticamente in base al tempo trascorso (2h, 12h, 20h, 28h).
