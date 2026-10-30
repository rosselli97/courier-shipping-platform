# MUVPACK — Courier Shipping Platform

Piattaforma B2B per spedizioni con Poste Italiane, BRT e DHL: preventivo multi-corriere, portafoglio prepagato, lettere di vettura PDF, tracking, rubrica destinatari, ticket di assistenza e area super admin.

## Struttura

- Root: frontend React 19 + Vite + Tailwind 4 (deploy su Vercel)
- `backend/`: API FastAPI + SQLite (deploy separato)

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

## Deploy

Il frontend è pronto per Vercel (`vercel.json` include il rewrite SPA per le rotte client-side).

Il backend FastAPI non gira su Vercel: pubblicalo su un host Python (Render, Railway, Fly.io, ecc.) e imposta sul progetto Vercel la variabile:

```
VITE_API_BASE=https://tuo-backend.example.com
```

Senza `VITE_API_BASE` il frontend chiama `/api` sullo stesso dominio.

## Account demo

| Ruolo | Email | Password |
|---|---|---|
| Super admin | `admin@muvpack.it` | `Admin123!` |
| Rivenditore | `reseller@muvpack.it` | `Reseller123!` |

Tracking demo: `MVP20260001`.

## Note

- Il backend in `backend/` è una ricostruzione compatibile con il frontend; le tariffe corrieri sono valori demo.
- Stripe e SMTP sono opzionali: senza chiavi il checkout è simulato e le email risultano inviate senza invio reale.
