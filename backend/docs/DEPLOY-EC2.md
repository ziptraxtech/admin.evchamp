# Deploying the EvChamp backend to AWS EC2 (Vercel-proxy / Option B)

The backend is **one persistent Node process** = Express API (`:3000`) **+** OCPP CSMS
WebSocket (`:9220`). It is **not** serverless (OCPP sockets are long-lived) and runs as a
**single instance** (the OCPP registry is in-memory — see `src/ocpp/registry.ts`).

**HTTPS is handled by Vercel, not this box.** The frontends proxy `/api/*` to the EC2 IP
(a rewrite in each `next.config.ts`), so the browser only ever talks HTTPS to Vercel and
Vercel forwards to the plain-HTTP backend. That means **no domain, no nginx, no TLS certs**
on the server — you just need a stable IP. (When you later want your own domain + on-box TLS,
switch to the nginx/certbot flow — kept in `deploy/nginx-evchamp.conf`.)

```
Browser ──HTTPS──▶ *.vercel.app  ──(rewrite /api/*)──HTTP──▶  http://<elastic-ip>:3000  (this box)
```

---

## 0. Pre-flight
- An AWS account. **No domain required.**
- Confirm the **leaked Neon endpoint was rotated/deleted** (`ep-soft-forest…`). The server
  uses your working cred (`ep-soft-fire…`) placed in `backend/.env.local` (step 5).

## 1. Launch the EC2 instance
- **AMI:** Ubuntu Server 22.04 LTS.
- **Type:** `t3.small` (2 GB) recommended; `t3.micro` is free-tier-eligible and fine for a demo.
- **Key pair:** create/download one for SSH.
- **Security group (inbound rules):**
  | Port | Type | Source | Why |
  |------|------|--------|-----|
  | 22   | SSH | your IP | SSH access |
  | 3000 | Custom TCP | `0.0.0.0/0` | API — Vercel's servers must reach it |
  | 9220 | Custom TCP | (add later) | OCPP — only when real chargers connect |

  > No 80/443 needed — Vercel terminates HTTPS, not this box.

## 2. Allocate + associate an Elastic IP (stable IP)
EC2 Console → **Network & Security → Elastic IPs** → **Allocate Elastic IP address** →
select it → **Actions → Associate** → choose your instance. This IP is what goes in
`BACKEND_ORIGIN` (step 7). Without it, the public IP changes on stop/start and breaks the proxy.

## 3. SSH in + install runtime (no nginx)
```bash
ssh -i your-key.pem ubuntu@<elastic-ip>

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm i -g pm2
```

## 4. Get the code
Private repo → use a GitHub deploy key or a PAT.
```bash
git clone https://github.com/ziptraxtech/admin.evchamp.git
cd admin.evchamp/backend
npm ci
npm run build          # tsc -> dist/
```

## 5. Configure secrets (server-side only)
```bash
cp .env.example .env.local
nano .env.local
```
Set the REAL values:
```
DATABASE_URL=postgresql://...ep-soft-fire...-pooler...neon.tech/neondb?sslmode=require&channel_binding=require
DATABASE_URL_DIRECT=postgresql://...ep-soft-fire...neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET=<long random string>
HTTP_PORT=3000
OCPP_PORT=9220
# CORS_ORIGINS not needed on the proxied path (browser sees same-origin via Vercel).
# RAZORPAY_* when wiring real payments.
```
> `.env.local` is gitignored — it never leaves the server. Never put these in `.env.example`.

## 6. Database + run
```bash
npm run db:migrate         # if this DB isn't migrated yet
# npm run seed             # optional demo data
# npm run create-cpo -- --userId zipbolt --password '<pw>' --company "EvChamp"

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                # run the command it prints (systemd autostart on reboot)
pm2 logs evchamp-api       # verify: "[API] listening" + "[OCPP] CSMS listening"
```
Sanity check from your laptop: `curl http://<elastic-ip>:3000/api/charger/0001` should return JSON.

## 7. Point the frontends at it (the Vercel proxy)
In **both** Vercel projects → Settings → Environment Variables → **Production**:
| Variable | Value |
|---|---|
| `BACKEND_ORIGIN` | `http://<elastic-ip>:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | `/api` |
| `NEXT_PUBLIC_PAY_BASE_URL` (console only) | `https://evchampay.vercel.app` |

Then **redeploy** both. The `next.config.ts` rewrite forwards `https://<app>.vercel.app/api/*`
→ `http://<elastic-ip>:3000/api/*` server-side, so the browser stays same-origin HTTPS.

## 8. Re-enable auth
Set `AUTH_DISABLED = false` in `admin_pay/frontend/lib/api.ts`, commit, push → Vercel
redeploys. (It was bypassed only while there was no backend.) Otherwise the admin console is
world-open once real data is behind it.

---

## Updating later
```bash
cd admin.evchamp/backend
git pull
npm ci && npm run build
pm2 restart evchamp-api
```

## Notes / limits
- **Single instance only** until the OCPP registry is Redis-backed — do not put this behind an
  autoscaling group / multiple instances (a charger's socket lives on one box).
- **Port 3000 is public HTTP.** Anyone can hit `http://<elastic-ip>:3000/api/...` directly.
  Admin routes are JWT-protected server-side and customer routes are public anyway, so it's
  acceptable for now — but it's exposed. Locking it down = move to the domain+TLS flow
  (`deploy/nginx-evchamp.conf`) or restrict the security group to Vercel's IP ranges.
- **OCPP TLS (`wss://:9220`)** is only needed when physical chargers connect — see the tail of
  `deploy/nginx-evchamp.conf`. Skip until you onboard hardware.
- **Upgrade path to a real domain:** buy a domain, point an A record at the Elastic IP, run the
  nginx + certbot steps, then set `BACKEND_ORIGIN=https://api.yourdomain` (or drop the proxy and
  point `NEXT_PUBLIC_API_BASE_URL` straight at `https://api.yourdomain/api`).
- This deploys the **current OCPP/CPO backend**. The aggregator roadmap (consuming CPO OCPI as
  an eMSP) is a separate build — see `docs/ocpi-emsp-design.md`.
