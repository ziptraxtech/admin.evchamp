# EvChamp Pay — Backend

OCPP 1.6J Central System (CSMS) + payment/QR API, on **NeonDB** (Postgres) with **Drizzle**.

This is the single-process MVP topology: one Node process runs both the OCPP
WebSocket server (chargers dial in) and the HTTP API (pay page + payment webhook),
sharing an in-memory socket registry and the Neon database.

```
src/
├── index.ts            entry — starts both servers
├── config.ts           ports + the failure-path decision toggles
├── db/
│   ├── schema.ts       Drizzle schema (chargers, connectors, price groups, sessions, payments)
│   └── index.ts        Neon connection (pooled TCP for this persistent process)
├── ocpp/
│   ├── messages.ts     OCPP-J 1.6 wire framing (CALL/CALLRESULT/CALLERROR)
│   ├── registry.ts     live socket map + call() bridge to chargers
│   └── server.ts       CSMS: Boot/Heartbeat/Status/Start/MeterValues/Stop handlers
├── services/
│   ├── pricing.ts      additive model: base + 18% GST + 2% txn = total; kWh = base/₹15
│   ├── sessions.ts     ★ the rules: verify-before-consume, stop-at-budget, refund
│   ├── refunds.ts      gateway refund + record (Razorpay TODO)
│   └── notify.ts       email/SMS stubs (invoice, refund notice)
├── api/server.ts       GET charger, POST quote, POST payments/webhook, dev/simulate-payment
└── dev/
    ├── seed.ts         demo org/station/charger CK-ANDHERI-08 + connectors
    └── fake-charger.ts simulated OCPP charger (no hardware needed)
```

## Setup

1. **Install**
   ```bash
   npm install
   ```
2. **Database (Neon)** — create a Neon project, copy both connection strings into `.env`
   (see `.env.example`). `DATABASE_URL` = pooled, `DATABASE_URL_DIRECT` = direct.
3. **Migrate + seed**
   ```bash
   npm run db:generate   # generate SQL from schema
   npm run db:migrate    # apply to Neon (uses the DIRECT url)
   npm run seed          # demo charger + connectors
   ```

## Run the whole loop (no hardware, no Razorpay)

In three terminals:

```bash
npm run dev            # 1) backend (OCPP :9220 + API :3000)
npm run fake-charger   # 2) simulated charger connects + goes Available
```
```bash
# 3) simulate a paid recharge -> watch auto-start, metering, stop, refund in the logs
curl -X POST http://localhost:3000/api/dev/simulate-payment \
  -H 'content-type: application/json' \
  -d '{"chargeboxId":"CK-ANDHERI-08","connectorNo":1,"baseAmount":300,"email":"you@email.com"}'
```

You'll see: `RemoteStartTransaction → StartTransaction → MeterValues…` until 20 kWh is
delivered, then `RemoteStopTransaction → StopTransaction → settle/refund → invoice`.

### Customer app API (serves pay.html, in `src/api/customer.ts`)
Maps 1:1 to the pay-page flow:

| Pay screen | Endpoint |
|---|---|
| Select connector | `GET  /api/charger/:chargeboxId` — connectors + live status |
| Recharge | `POST /api/quote` `{chargeboxId, connectorNo, amount\|kwh}` — base/GST/txn/total/kWh |
| Email + Pay | `POST /api/checkout` `{chargeboxId, connectorNo, amount, email, phone?}` → `paymentId` |
| Post-payment poll | `GET  /api/payment/:id` → paymentStatus + session (did it start? / refunded?) |
| Live charging | `GET  /api/session/:id` → status, kwh, paidKwh, energySpent |
| Receipt | `GET  /api/session/:id/receipt` → energy/GST/txn/total/refund |
| Stop button | `POST /api/session/:id/stop` |

Checkout is **two-phase**: `/checkout` creates a `created` payment (captures email up front);
the gateway **webhook** (`POST /api/payments/webhook`, signature-verified + idempotent) calls
`confirm()` → starts the session. The button never triggers charging — the webhook does, so a
closed tab can't strand a paid session.

## Decision toggles (in `src/config.ts`)
- `startTimeoutMs` (default 90s) — wait for StartTransaction before full refund
- `refundAbsorbsGatewayFee` (default true) — operator eats the 2% on charger-failure refunds
- `meterLossPolicy` (default 'conservative') — **still open** for your final call

## Notes
- The OCPP server **must** run as a persistent process (not serverless) — WebSockets
  are long-lived and sticky. To scale horizontally, swap `ocpp/registry.ts` for Redis pub/sub.
- Razorpay is stubbed (`refunds.ts`, webhook handler) — wire keys when ready.
