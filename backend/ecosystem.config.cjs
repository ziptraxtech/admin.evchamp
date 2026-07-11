// pm2 process config for the EvChamp backend (API + OCPP CSMS in one process).
// Usage on the EC2 box:
//   npm ci && npm run build
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup     # survive reboots
//
// Env comes from backend/.env.local (loaded by src/env.ts via dotenv) — do NOT
// duplicate secrets here. This file is committed; .env.local is gitignored.
module.exports = {
  apps: [
    {
      name: 'evchamp-api',
      script: 'dist/index.js',
      instances: 1,              // MUST stay 1 — OCPP registry is in-memory (not clustered)
      exec_mode: 'fork',         // not 'cluster' — WebSockets are sticky to one process
      max_memory_restart: '400M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
