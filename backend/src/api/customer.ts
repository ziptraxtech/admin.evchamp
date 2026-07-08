// Customer app API — everything the pay page (pay.html) needs, end to end.
//   GET  /api/charger/:chargeboxId      connector list + live status  (select-connector screen)
//   POST /api/quote                     price breakdown               (recharge screen)
//   POST /api/checkout                  create payment intent         (after email captured)
//   GET  /api/payment/:id               poll: did the session start?  (post-payment)
//   GET  /api/session/:id               live charging status          (charging screen)
//   GET  /api/session/:id/receipt       final GST breakdown + refund  (receipt screen)
//   POST /api/session/:id/stop          driver-initiated stop

import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chargers, connectors, chargingSessions, payments } from '../db/schema.js';
import { quoteByAmount, quoteByKwh } from '../services/pricing.js';
import * as paymentsSvc from '../services/payments.js';
import * as sessions from '../services/sessions.js';
import * as registry from '../ocpp/registry.js';

export const customerRouter = Router();

customerRouter.get('/charger/:chargeboxId', async (req, res) => {
  const charger = await db.query.chargers.findFirst({
    where: eq(chargers.chargeboxId, req.params.chargeboxId),
    with: { connectors: { with: { priceGroup: true } }, station: true },
  });
  if (!charger) return res.status(404).json({ error: 'charger_not_found' });
  res.json({
    chargeboxId: charger.chargeboxId,
    station: (charger as any).station?.name ?? null,
    online: registry.isOnline(charger.chargeboxId),
    connectors: (charger as any).connectors
      .sort((a: any, b: any) => a.connectorNo - b.connectorNo)
      .map((c: any) => ({
        connectorNo: c.connectorNo, name: c.name, type: c.connectorType,
        powerKw: Number(c.powerKw), voltageV: Number(c.voltageV),
        status: c.status, available: c.status === 'available',
        pricePerKwh: Number(c.priceGroup?.pricePerKwh ?? 0),
      })),
  });
});

customerRouter.post('/quote', async (req, res) => {
  const { chargeboxId, connectorNo, amount, kwh } = req.body ?? {};
  const c = await findConnector(chargeboxId, connectorNo);
  if (!c) return res.status(404).json({ error: 'connector_not_found' });
  const pg = (c as any).priceGroup;
  const price = Number(pg?.pricePerKwh ?? 15), gst = Number(pg?.gstPct ?? 18), txn = Number(pg?.txnPct ?? 2);
  const min = Number(pg?.minRecharge ?? 300);
  const q = kwh != null ? quoteByKwh(Number(kwh), price, gst, txn) : quoteByAmount(Number(amount), price, gst, txn);
  // min applies to the total payable (tax-inclusive — that's what the customer enters/pays)
  if (q.total < min) return res.status(400).json({ error: 'below_minimum', min });
  res.json({ ...q, pricePerKwh: price, min });
});

// Email captured here (required). Returns a paymentId the client polls after paying.
// In production you'd also create a Razorpay order/QR with notes.paymentId and return it.
customerRouter.post('/checkout', async (req, res) => {
  const { chargeboxId, connectorNo, amount, email, phone } = req.body ?? {};
  const r = await paymentsSvc.createIntent({ chargeboxId, connectorNo, baseAmount: Number(amount), email, phone });
  if (!r.ok) return res.status(400).json(r);
  res.json({
    ok: true, paymentId: r.paymentId, breakdown: r.breakdown,
    // gateway: { provider:'razorpay', orderId } -> wire Razorpay Orders/QR here
    gateway: { provider: 'razorpay', orderId: null, note: 'Razorpay not wired yet' },
  });
});

// Poll after payment: tells the pay page when the session is live (or failed -> refunded)
customerRouter.get('/payment/:id', async (req, res) => {
  const payment = await db.query.payments.findFirst({ where: eq(payments.id, req.params.id) });
  if (!payment) return res.status(404).json({ error: 'payment_not_found' });
  let session = null;
  if (payment.sessionId) {
    const s = await db.query.chargingSessions.findFirst({ where: eq(chargingSessions.id, payment.sessionId) });
    session = s ? { id: s.id, status: s.status } : null;
  }
  res.json({
    paymentStatus: payment.status,
    refundAmount: Number(payment.refundAmount),
    session,
  });
});

customerRouter.get('/session/:id', async (req, res) => {
  const view = await sessionView(req.params.id);
  if (!view) return res.status(404).json({ error: 'session_not_found' });
  res.json(view);
});

customerRouter.get('/session/:id/receipt', async (req, res) => {
  const view = await sessionView(req.params.id, true);
  if (!view) return res.status(404).json({ error: 'session_not_found' });
  res.json(view);
});

customerRouter.post('/session/:id/stop', async (req, res) => {
  await sessions.stopSession(req.params.id, 'driver_stopped');
  res.json({ ok: true });
});

/* ---------- helpers ---------- */
async function findConnector(chargeboxId: string, connectorNo: number) {
  const charger = await db.query.chargers.findFirst({ where: eq(chargers.chargeboxId, chargeboxId) });
  if (!charger) return null;
  return db.query.connectors.findFirst({
    where: and(eq(connectors.chargerId, charger.id), eq(connectors.connectorNo, Number(connectorNo))),
    with: { priceGroup: true },
  });
}

async function sessionView(sessionId: string, receipt = false) {
  const session = await db.query.chargingSessions.findFirst({
    where: eq(chargingSessions.id, sessionId),
    with: { connector: { with: { charger: true, priceGroup: true } } },
  });
  if (!session) return null;
  const price = Number((session.connector as any).priceGroup?.pricePerKwh ?? 0);
  const payment = await db.query.payments.findFirst({ where: eq(payments.sessionId, session.id) });
  const usedKwh = Number(session.kwh ?? 0);
  const base = { id: session.id, status: session.status, kwh: usedKwh, paidKwh: Number(session.paidKwh),
    energySpent: Number((usedKwh * price).toFixed(2)),
    connector: `${(session.connector as any).charger.chargeboxId} · C${(session.connector as any).connectorNo}`,
    txnId: payment?.providerRef ?? null, stopReason: session.stopReason ?? null };
  if (!receipt) return base;
  return {
    ...base,
    energyValue: Number((usedKwh * price).toFixed(2)),
    gst: payment ? Number(payment.gstAmount) : 0,
    txn: payment ? Number(payment.txnFee) : 0,
    totalPaid: payment ? Number(payment.totalAmount) : 0,
    refund: payment ? Number(payment.refundAmount) : 0,
    stoppedAt: session.stoppedAt,
  };
}
