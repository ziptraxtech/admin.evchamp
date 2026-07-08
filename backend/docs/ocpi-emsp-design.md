# EvChamp OCPI eMSP Integration — Design

**Status:** Draft / proposal
**Audience:** EvChamp backend engineers
**Scope:** How EvChamp (a scan‑and‑pay payment layer) integrates with multiple CPOs
(CharjKaro and others) over **OCPI 2.2.1**, acting as an **eMSP**.

---

## 1. What role EvChamp plays

EvChamp is **not a CPO**. We do not own chargers and we do not speak OCPP to hardware.
We are the **eMSP** (e‑Mobility Service Provider): we own the *driver relationship* and the
*payment*. Each CPO (CharjKaro, etc.) exposes their **OCPI** interface; we consume it.

| OCPI role | Party | Owns |
|---|---|---|
| **CPO** | CharjKaro & other networks | Chargers, the OCPP link to them, live status |
| **eMSP** | **EvChamp** | Driver/app relationship, payment, settlement |

> ⚠️ **Prerequisite to confirm per CPO:** does the CPO actually expose **OCPI 2.2.1**, or only
> a proprietary REST API (like CharjKaro's `zipbolt/token` + `time_lapsed`)? OCPI = *one*
> integration for all compliant CPOs. Proprietary = *one adapter per CPO*. See §9 — the design
> hides this behind a `CpoAdapter` interface so both paths coexist.

### Our existing backend vs. what this adds
The current backend is built **CPO‑style** — it speaks OCPP directly to chargers
(`src/ocpp/`). For the aggregator model that layer is **only** relevant for chargers we
operate ourselves. This design adds the **opposite direction**: an OCPI *client* (eMSP) plus a
small set of OCPI *receiver* endpoints we must host. We keep and reuse the payment /
settlement services (`services/payments.ts`, `services/refunds.ts`, `services/sessions.ts`).

---

## 2. Module responsibilities (OCPI 2.2.1)

Each OCPI module has a *Sender* and *Receiver* interface. As an **eMSP**:

| Module | We are | We use it to |
|---|---|---|
| **Locations** | Receiver (pull/receive) | Read charger/EVSE/connector details **+ live `status`** → availability + what the pay page shows |
| **Tariffs** | Receiver | Price per kWh to quote before payment |
| **Commands** | **Sender** | `START_SESSION` after payment; `STOP_SESSION` on user stop |
| **Sessions** | Receiver | Live session progress (energy) |
| **CDRs** | Receiver | Final charge‑detail record → **settlement & refund** |
| **Tokens** | **Sender** | The token the CPO authorizes when starting a session (real‑time auth) |
| **Credentials/Versions** | Both | Registration handshake per CPO |

---

## 3. Architecture overview

```
                         ┌──────────────────────────── EvChamp backend (eMSP) ────────────────────────────┐
  Driver                 │                                                                                 │
  scans QR ──▶ pay page ─┼─▶ api/customer  ──▶ services/payments (Razorpay)                                │
  (cpo,loc,evse)         │        │                     │                                                  │
                         │        ▼                     ▼                                                  │
                         │   services/ocpi/locations   services/ocpi/commands ──(START_SESSION)──┐        │
                         │        │  (GET location)          ▲   │                                │        │
                         │        │                          │   └──(STOP_SESSION)                │        │
                         │   ┌────┴───────────────┐          │                                    │        │
                         │   │ services/ocpi/client│  per‑CPO auth (Token C) + base URL           │        │
                         │   └────────┬───────────┘                                               │        │
                         │            │                                                           │        │
                         │   HOSTED receiver endpoints  (api/ocpi/* , OCPI Token auth)            │        │
                         │   /ocpi/emsp/2.2.1/{credentials,locations,sessions,cdrs,tokens,commands}│       │
                         └────────────┼──────────────────────────────────────────────┬───────────┼────────┘
                                      │  async pushes (Sessions, CDR, command result) │  outbound │
                                      ▼                                               ▼           ▼
                         ┌──────────────────────────── CPO OCPI (CharjKaro, …) ─────────────────────────────┐
                         │  /ocpi/cpo/2.2.1/{versions,credentials,locations,sessions,cdrs,commands,tariffs}  │
                         │  speaks OCPP down to the physical chargers                                        │
                         └──────────────────────────────────────────────────────────────────────────────────┘
```

Two halves, like the OCPP design:
- **Outbound client** (`services/ocpi/`) — we call the CPO (pull Locations, POST Commands).
- **Hosted receiver** (`api/ocpi/`) — the CPO calls us (push Sessions/CDRs, command results,
  real‑time token authorization).

---

## 4. Data model

New Drizzle tables (sketch — column types abbreviated). Reuses existing `drivers`,
`payments`, `charging_sessions`, `refunds`.

### 4.1 `cpo_connections` — the OCPI partner registry (the core of multi‑CPO)
```ts
cpo_connections {
  id              uuid pk
  name            text           // "CharjKaro"
  kind            text           // 'ocpi' | 'proprietary'   ← selects the adapter (§9)
  country_code    text           // OCPI party country, e.g. 'IN'
  party_id        text           // OCPI party_id, e.g. 'CJK'
  versions_url    text           // CPO versions endpoint (out‑of‑band)
  token_a         text (enc)     // registration token (out‑of‑band, temporary)
  token_c         text (enc)     // token WE use to call the CPO (after handshake)
  token_b         text (enc)     // token the CPO uses to call US (we generate)
  endpoints       jsonb          // discovered module → URL map for the negotiated version
  ocpi_version    text           // '2.2.1'
  status          text           // 'pending' | 'registered' | 'error'
  created_at, updated_at
}
```
> Secrets (`token_*`) stored **encrypted at rest**. One row per CPO; adding a CPO = insert +
> run the handshake (§5).

### 4.2 `ocpi_commands` — correlate async command results
```ts
ocpi_commands {
  id            uuid pk          // == the response_url correlation id we hand the CPO
  cpo_id        uuid fk
  type          text             // 'START_SESSION' | 'STOP_SESSION'
  payment_id    uuid fk          // ties the command back to the payment/session
  session_id    uuid fk null
  response      text             // sync CommandResponse: ACCEPTED/REJECTED/...
  result        text null        // async CommandResult: ACCEPTED/FAILED/... (via callback)
  created_at, resolved_at
}
```

### 4.3 `ocpi_tokens` — eMSP tokens we issue (for START_SESSION + real‑time auth)
```ts
ocpi_tokens {
  uid           text pk          // OCPI token uid
  type          text             // 'APP_USER'
  driver_id     uuid fk
  auth_id       text             // contract id
  valid         boolean
  created_at
}
```
> MVP can mint an ephemeral `APP_USER` token per paid session instead of a persistent table.

### 4.4 Session / CDR linkage
Extend `charging_sessions` (or add a thin join) with:
```ts
  cpo_id            uuid fk null
  ocpi_session_id   text null      // CPO's session id
  ocpi_location_id  text null
  ocpi_evse_uid     text null
```
Store incoming CDRs raw (`ocpi_cdrs` jsonb) plus the extracted `total_energy`, `total_cost`,
`currency` for settlement.

---

## 5. Credentials handshake (per CPO, one‑time)

OCPI 2.2.1 registration. Tokens are sent as `Authorization: Token <base64(token)>`.

```
Out of band: CPO gives us  versions_url  +  TOKEN_A  (temporary registration token)

1. GET  {versions_url}                         Auth: Token A     → list of versions
2. GET  {version_2.2.1_detail_url}             Auth: Token A     → module endpoint map
                                                                   (incl. credentials URL)
3. Generate TOKEN_B (the token the CPO will use to call US). Store it.
4. POST {cpo_credentials_url}                  Auth: Token A
        body = Credentials{ token: TOKEN_B, url: <our versions_url>,
                            roles:[{ role:'EMSP', party_id:'EVC', country_code:'IN', … }] }
   ← CPO responds Credentials{ token: TOKEN_C, url, roles }   // TOKEN_C = what WE use henceforth
5. Persist TOKEN_C + discovered endpoints on cpo_connections; mark status='registered'.
   TOKEN_A is now dead. Steady state:  EvChamp→CPO uses TOKEN_C ;  CPO→EvChamp uses TOKEN_B.
```

Implementation: `services/ocpi/credentials.ts` (`register(cpoId)`), driven from an admin
console action. Also implement the **receiver** side of `credentials` (`api/ocpi/credentials.ts`)
so a CPO can (re)register/update against us.

---

## 6. Scan‑and‑pay flow (the money path)

```
QR encodes { cpo, location_id, evse_uid, connector_id }
   e.g.  https://pay.evchamp.app/?cpo=charjkaro&loc=LOC1&evse=EVSE1&conn=1

1. Pay page → GET /api/charger?...            → services/ocpi/locations.getConnector(cpo, loc, evse, conn)
     → returns { type, powerKw, status, tariff }.   BLOCK if status != AVAILABLE  (§ pre‑pay guard)
2. Quote from Tariff (services/pricing already tax‑inclusive) → show total.
3. User pays (services/payments.createIntent → Razorpay). Funds held.
4. On capture (webhook):  services/ocpi/commands.startSession({
        cpo, location_id, evse_uid, connector_id,
        token: <mint APP_USER token for driver>,
        response_url: https://api.evchamp.app/ocpi/emsp/2.2.1/commands/START_SESSION/{cmdId}
     })
     ← sync CommandResponse ACCEPTED  (else refund — reuse services/refunds)
5. CPO may POST /ocpi/emsp/2.2.1/tokens/{uid}/authorize  → we reply ALLOWED (already paid).
6. Async CommandResult ACCEPTED → CPO POSTs to our response_url → mark session 'charging'.
     (If FAILED / timeout → refund.)
7. CPO pushes Session updates → PUT /ocpi/emsp/2.2.1/sessions/... → live kWh on the pay page.
8. User stops (or energy budget hit) → services/ocpi/commands.stopSession(...).
9. CPO POSTs the CDR → /ocpi/emsp/2.2.1/cdrs → services/ocpi/cdr.settle():
        compare CDR total_cost vs amount paid → refund difference (services/refunds)
        → email GST invoice (services/notify) → remit to CPO per commercial terms.
```

This mirrors the existing OCPP `startSessionAfterPayment` state machine
(`services/sessions.ts`) — **capture first, every failure branch refunds** — but the
"start" is an OCPI Command to the CPO instead of an OCPP RemoteStart to our own charger.

---

## 7. Endpoints we must HOST (eMSP receiver interfaces)

Base: `/ocpi/emsp/2.2.1/…` — all behind OCPI **Token auth** (validate the CPO's `TOKEN_B`).

| Endpoint | Method | Purpose |
|---|---|---|
| `/versions`, `/2.2.1` | GET | Version + module discovery (for CPO calling us) |
| `/credentials` | POST/PUT/GET/DELETE | Registration handshake (receiver side) |
| `/locations/...` | GET/PUT/PATCH | Receive location pushes (optional if we pull on demand) |
| `/sessions/...` | GET/PUT/PATCH | Receive session updates |
| `/cdrs` | GET/POST | Receive CDRs (settlement trigger) |
| `/tokens/{uid}/authorize` | POST | Real‑time authorization → `ALLOWED`/`BLOCKED` |
| `/commands/{type}/{id}` | POST | Async command result callback (`response_url`) |

New router `api/ocpi/server.ts` + middleware `ocpiAuth` (looks up `cpo_connections` by the
presented token). Mount alongside the existing customer/admin routers.

---

## 8. Calls we MAKE (CPO sender interfaces)

Via `services/ocpi/client.ts` — a small fetch wrapper that, given a `cpoId`, loads base
URL + `TOKEN_C` + endpoint map and signs requests (`Authorization: Token <base64>`), with
OCPI envelope handling (`{ data, status_code, status_message, timestamp }`, success = 1000).

- `GET  {locations}/{country}/{party}/{loc}/{evse}/{conn}` → live connector + status
- `GET  {tariffs}/...` → tariff for the quote
- `POST {commands}/START_SESSION` , `POST {commands}/STOP_SESSION`
- (optional) `GET {sessions}/...`, `GET {cdrs}/...` if pulling instead of receiving

---

## 9. Adapter abstraction — OCPI *and* proprietary CPOs

Because some CPOs (today: CharjKaro) hand us a **proprietary** API, not OCPI, hide the CPO
behind one interface so the pay/settlement flow never branches:

```ts
// services/ocpi/adapter.ts
export interface CpoAdapter {
  getConnector(loc: string, evse: string, conn: string): Promise<ConnectorView>;
  getTariff(...): Promise<Tariff>;
  startSession(req: StartReq): Promise<CommandAck>;   // returns/awaits async result
  stopSession(req: StopReq): Promise<CommandAck>;
  // CDRs arrive via hosted receiver (OCPI) or webhook/poll (proprietary)
}

// two implementations, selected by cpo_connections.kind:
//   OcpiAdapter        → real OCPI 2.2.1 (this design)
//   CharjKaroAdapter   → wraps zipbolt/token + time_lapsed + their start/stop API
```

`cpo_connections.kind = 'ocpi' | 'proprietary'` picks the implementation at runtime. The
scan‑and‑pay flow (§6) only ever sees `CpoAdapter`. **This is the key decision point:** every
OCPI CPO is free; every proprietary CPO costs one adapter.

---

## 10. Mapping OCPI ↔ internal models (`services/ocpi/mapper.ts`)

| OCPI object | Internal |
|---|---|
| Location / EVSE / Connector | (transient view; we don't need our own `chargers` rows for partner CPOs) |
| Connector `status` (AVAILABLE/CHARGING/…) | availability guard on the pay page |
| Tariff | quote input to `services/pricing` |
| Session | `charging_sessions` (+ `ocpi_session_id`) |
| CDR | settlement input → `payments` / `refunds` |
| Token (APP_USER) | `ocpi_tokens` ↔ `drivers` |

---

## 11. Settlement & refund

The **CDR is the source of truth** for money. On CDR receipt:
```
paid           = payments.total_amount            (tax‑inclusive, what the driver paid)
delivered_cost = cdr.total_cost                   (what the CPO charges us)
refund_to_user = max(0, paid − our_price(delivered_energy))
cpo_payable    = delivered_cost                   (we owe the CPO, per contract)
margin         = paid − refund_to_user − cpo_payable
```
Refund via existing `services/refunds.ts`; invoice via `services/notify.ts`. CPO remittance is
out of band (reconciliation report), not real‑time.

---

## 12. Security

- Store `token_a/b/c` **encrypted at rest**; never log them.
- Hosted `/ocpi/*` endpoints: validate the presented token against `cpo_connections`
  (constant‑time compare); reject unknown parties.
- All OCPI traffic over **HTTPS**. Our public base URL must be stable (it's baked into the
  credentials handshake).
- Idempotency: CDR receipt and command results must be idempotent (CPOs retry).
- Rate‑limit + size‑limit inbound pushes.

---

## 13. Phased roadmap

**Phase 0 — decide per CPO:** confirm OCPI vs proprietary. Get `versions_url` + `TOKEN_A`.
**Phase 1 — MVP happy path (one OCPI CPO):**
  `cpo_connections` + handshake · pull Location (status + tariff) · `START_SESSION` ·
  receive Session + CDR · settle/refund. Wire into the existing pay page + payments.
**Phase 2 — hardening:** real‑time token authorize, `STOP_SESSION`, command timeouts/refunds,
  idempotency, encryption, admin console CPO management UI.
**Phase 3 — scale:** N CPOs via `cpo_connections`; `CharjKaroAdapter` (proprietary) behind
  `CpoAdapter`; reconciliation/remittance reports.

---

## 14. Open questions

1. **CharjKaro: OCPI or proprietary?** (Blocks Phase 0. Today they gave us a proprietary API.)
2. Do we **pull** Locations on demand or **mirror** them (CPO pushes)? MVP = pull on demand.
3. Token model: persistent per‑driver `APP_USER` token vs ephemeral per‑session token.
4. Commercial: how is `cpo_payable` reconciled/remitted — is that in the OCPI CDR or a
   separate settlement agreement per CPO?
5. Multi‑currency / multi‑country parties (OCPI is EU‑born; confirm CPO `country_code`/`party_id`).

---

## 15. New files (proposed)

```
src/
├── api/ocpi/
│   ├── server.ts            mount + ocpiAuth middleware
│   ├── credentials.ts       receiver handshake
│   ├── locations.ts         receiver (optional)
│   ├── sessions.ts          receiver (session pushes)
│   ├── cdrs.ts              receiver (settlement trigger)
│   ├── tokens.ts            real‑time authorize
│   └── commands.ts          async command‑result callback
├── services/ocpi/
│   ├── client.ts            per‑CPO authed fetch + OCPI envelope
│   ├── credentials.ts       register(cpoId) handshake driver
│   ├── locations.ts         getConnector / getTariff
│   ├── commands.ts          startSession / stopSession + correlation
│   ├── cdr.ts               settle()
│   ├── tokens.ts            mint / authorize
│   ├── adapter.ts           CpoAdapter interface + selector
│   ├── ocpiAdapter.ts       OCPI 2.2.1 implementation
│   ├── charjkaroAdapter.ts  proprietary fallback (zipbolt/token + time_lapsed)
│   └── mapper.ts            OCPI ↔ internal models
└── db/ (schema additions)   cpo_connections, ocpi_commands, ocpi_tokens, cdr fields
```
