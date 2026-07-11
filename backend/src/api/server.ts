// HTTP server — mounts the customer API, plus the payment webhook and a dev helper.
// Topology note: this runs as a persistent Express server (same process as the OCPP
// CSMS), NOT serverless — OCPP WebSockets are long-lived and must stay in-process.

import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { customerRouter } from './customer.js';
import { adminRouter } from './admin.js';
import { authRouter, requireCpo } from './auth.js';
import * as paymentsSvc from '../services/payments.js';

export function startApiServer() {
  const app = express();

  // CORS — the customer & admin sites run on different origins.
  // Set CORS_ORIGINS to a comma-separated allowlist in production
  // (e.g. "https://evchampay.vercel.app,https://admin-evchamp.vercel.app").
  // Unset / "*" allows any origin (dev default).
  const allowed = (process.env.CORS_ORIGINS ?? '*')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const allowAny = allowed.includes('*');
  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (allowAny) {
      res.header('Access-Control-Allow-Origin', '*');
    } else if (origin && allowed.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Headers', 'content-type, authorization');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // 1) Webhook FIRST with a raw body — signature verification needs the exact bytes,
  //    so it must run before express.json() touches the stream.
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.header('x-razorpay-signature') ?? '';
    const expected = crypto.createHmac('sha256', config.razorpayWebhookSecret).update(req.body).digest('hex');
    if (!config.razorpayWebhookSecret || signature !== expected) return res.status(400).send('bad signature');

    const event = JSON.parse(req.body.toString());
    const entity = event?.payload?.payment?.entity ?? event?.payload?.qr_code?.entity;
    const paymentId = entity?.notes?.paymentId;
    if (!paymentId) return res.status(200).send('ignored');

    await paymentsSvc.confirm(paymentId, entity.id);  // idempotent
    res.status(200).json({ ok: true });
  });

  // 2) Everything else is JSON.
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api', customerRouter);
  app.use('/api/admin', requireCpo, adminRouter);

  // 3) DEV: stand in for Razorpay.
  //   simulate-payment = create intent + confirm in one (quick test)
  //   confirm/:id      = confirm an existing checkout intent (real two-phase flow)
  app.post('/api/dev/simulate-payment', async (req, res) => {
    const { chargeboxId, connectorNo, baseAmount, email, phone } = req.body ?? {};
    const r = await paymentsSvc.createIntent({
      chargeboxId, connectorNo, baseAmount: Number(baseAmount ?? 300),
      email: email ?? 'demo@evchamp.in', phone,
    });
    if (!r.ok) return res.status(400).json(r);
    await paymentsSvc.confirm(r.paymentId, 'SIM-' + crypto.randomUUID().slice(0, 8));
    res.json({ ok: true, paymentId: r.paymentId, breakdown: r.breakdown });
  });

  app.post('/api/dev/confirm/:paymentId', async (req, res) => {
    const p = await paymentsSvc.confirm(req.params.paymentId, 'SIM-' + crypto.randomUUID().slice(0, 8));
    if (!p) return res.status(404).json({ error: 'payment_not_found' });
    res.json({ ok: true });
  });

  app.listen(config.httpPort, () => console.log(`[API] listening on http://0.0.0.0:${config.httpPort}`));
  return app;
}
