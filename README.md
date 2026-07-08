# EvChamp Pay — Admin (`admin_pay`)

The **operator side** of EvChamp Pay. This repo contains:

1. **Backend** (`backend/`) — the OCPP 1.6J Central System (CSMS) **+** the HTTP API,
   running as a single persistent Node process on **NeonDB** (Postgres) with Drizzle.
   This is the only backend in the system — the customer pay app (`evchamp_pay`) is a
   thin client that calls this API.
2. **Frontend** (`frontend/`) — the CPO/operator web console (login + dashboard): stations,
   charge points, connectors, RFID tags, price groups, transactions, and a station map.
   Built with **Next.js 15 (App Router) · TypeScript · Tailwind v4**.

```
admin_pay/
├── backend/            Express API + OCPP CSMS + Neon/Drizzle
│   ├── src/
│   │   ├── index.ts        entry — starts both servers
│   │   ├── config.ts       ports + failure-path decision toggles
│   │   ├── db/             Drizzle schema + Neon connection
│   │   ├── ocpp/           CSMS: Boot/Heartbeat/Status/Start/MeterValues/Stop
│   │   ├── services/       pricing, sessions, refunds, notify
│   │   ├── api/            auth, customer, admin routers + server
│   │   └── dev/            seed, fake-charger, create-cpo
│   └── .env.example
├── frontend/           Next.js operator console
│   ├── app/
│   │   ├── page.tsx            login
│   │   ├── dashboard/page.tsx  console shell (view state + hash routing)
│   │   └── globals.css         Tailwind v4 + CSS-variable theme
│   ├── components/
│   │   ├── Sidebar · Header · Modal · LeafletMap
│   │   └── views/             Dashboard, Stations, Chargers, ChargerDetail,
│   │                          Rfid, Pricing, Transactions, Settings
│   ├── lib/api.ts             auth + admin fetch helpers
│   └── .env.local.example
├── .env.local.example  (backend env)
└── .gitignore
```

## Prerequisites
- Node 20+
- A NeonDB project (free tier is fine)

## Setup

```bash
cd backend
npm install

# configure environment (copy the backend section of the repo-root example)
cp ../.env.local.example .env       # then edit DATABASE_URL(_DIRECT), JWT_SECRET, …

# database
npm run db:generate    # generate SQL from schema
npm run db:migrate     # apply to Neon (uses the DIRECT url)
npm run seed           # demo org/station/charger + connectors

# create an operator login for the console
npm run create-cpo -- --userId zipbolt --password zipbolt123 --company "EvChamp"
```

## Run

**Terminal 1 — backend (API :3000 + OCPP :9220):**
```bash
cd backend
npm run dev
```

**Terminal 2 — console (Next.js :5600):**
```bash
cd frontend
npm install
npm run dev
```
Open <http://localhost:5600> and sign in.

> Optional: `cp frontend/.env.local.example frontend/.env.local` to point the console at a
> non-default API or pay-app URL. Without it, the console defaults to
> `http://localhost:3000/api` and `http://localhost:5601` for the pay app.
>
> Frontend env vars (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_PAY_BASE_URL`) are inlined
> into the browser bundle at build time.

### Simulate a charger (no hardware)
```bash
cd backend
npm run fake-charger -- 0001     # connects as charger 0001, goes Available
```

## Environment

See [`.env.local.example`](./.env.local.example). Key variables (backend):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** string — runtime |
| `DATABASE_URL_DIRECT` | Neon **direct** string — migrations only |
| `JWT_SECRET` | signs/verifies operator console JWTs |
| `HTTP_PORT` / `OCPP_PORT` | API (3000) / OCPP WebSocket (9220) |
| `RAZORPAY_*` | payment gateway (stubbed for now) |

## Notes
- The OCPP server **must** run as a persistent process (not serverless) — WebSockets are
  long-lived and sticky. To scale horizontally, swap `ocpp/registry.ts` for Redis pub/sub.
- Razorpay is stubbed (`services/refunds.ts`, webhook handler) — wire keys when ready.
- The customer pay app lives in the separate **`evchamp_pay`** repo and talks to this API.
