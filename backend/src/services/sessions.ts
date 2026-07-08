// Session orchestration — the heart of the system. This is where the rules you
// decided live:
//   • Prepaid: capture first, then RemoteStart.
//   • "Verify before consume": money is only KEPT once StartTransaction is confirmed.
//     Offline / Faulted / Rejected / no-StartTransaction-within-timeout => FULL refund.
//   • Stop when delivered kWh >= paid kWh (or driver/charger ends it sooner).
//   • On stop: settle and refund the unused energy value.

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chargingSessions, connectors, chargers, payments } from '../db/schema.js';
import { config } from '../config.js';
import * as registry from '../ocpp/registry.js';
import * as refunds from './refunds.js';
import * as notify from './notify.js';

// connectorId -> the prepaid start we're waiting for StartTransaction to confirm
const pendingStarts = new Map<string, { sessionId: string; paymentId: string; timer: NodeJS.Timeout }>();

/* ---- (1) Payment confirmed -> try to start charging --------------------- */
export async function startSessionAfterPayment(paymentId: string) {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
    with: { connector: { with: { charger: true, priceGroup: true } }, driver: true },
  });
  if (!payment || !payment.connector) return;

  const connector = payment.connector;
  const charger = (connector as any).charger;
  const pricePerKwh = Number((connector as any).priceGroup?.pricePerKwh ?? 0);
  const paidKwh = pricePerKwh ? Number(payment.baseAmount) / pricePerKwh : 0;

  // GUARD: charger must be online AND connector available right now.
  if (!registry.isOnline(charger.chargeboxId) || connector.status !== 'available') {
    return failAndRefund(payment, 'charger_unavailable');
  }

  const idTag = 'EVP-' + randomUUID().slice(0, 8).toUpperCase();
  const [session] = await db.insert(chargingSessions).values({
    connectorId: connector.id,
    driverId: payment.driverId ?? null,
    paidKwh: paidKwh.toFixed(3),
    idTag,
    status: 'pending_start',
  }).returning();
  await db.update(payments).set({ sessionId: session.id, status: 'captured' }).where(eq(payments.id, payment.id));

  // Ask the charger to start.
  try {
    const res = await registry.call(charger.chargeboxId, 'RemoteStartTransaction',
      { connectorId: connector.connectorNo, idTag }, 30_000);
    if (res?.status !== 'Accepted') return failAndRefund(payment, 'remote_start_rejected', session.id);
  } catch {
    return failAndRefund(payment, 'remote_start_error', session.id);
  }

  // Accepted != started. Wait for StartTransaction; if it never comes -> refund.
  const timer = setTimeout(() => {
    pendingStarts.delete(connector.id);
    failAndRefund(payment, 'start_timeout', session.id).catch(() => {});
  }, config.startTimeoutMs);
  pendingStarts.set(connector.id, { sessionId: session.id, paymentId: payment.id, timer });
}

/* ---- (2) Charger confirms it actually started --------------------------- */
export async function onStartTransaction(
  chargeboxId: string, connectorNo: number, _idTag: string, meterStart: number, transactionId: number,
) {
  const connector = await loadConnector(chargeboxId, connectorNo);
  if (!connector) return;
  const pending = pendingStarts.get(connector.id);
  if (!pending) return; // unsolicited (manual/RFID) start — out of scope for this MVP

  clearTimeout(pending.timer);
  pendingStarts.delete(connector.id);

  await db.update(chargingSessions).set({
    status: 'charging', startMeterWh: meterStart, ocppTransactionId: transactionId, startedAt: new Date(),
  }).where(eq(chargingSessions.id, pending.sessionId));
  await db.update(payments).set({ status: 'committed' }).where(eq(payments.id, pending.paymentId));
}

/* ---- (3) Meter ticks -> stop when the paid energy is delivered ---------- */
export async function onMeterValues(chargeboxId: string, connectorNo: number, wh: number) {
  const connector = await loadConnector(chargeboxId, connectorNo);
  if (!connector) return;
  const session = await db.query.chargingSessions.findFirst({
    where: and(eq(chargingSessions.connectorId, connector.id), eq(chargingSessions.status, 'charging')),
  });
  if (!session || session.startMeterWh == null) return;

  const usedKwh = Math.max(0, (wh - session.startMeterWh) / 1000);
  await db.update(chargingSessions).set({ kwh: usedKwh.toFixed(3) }).where(eq(chargingSessions.id, session.id));

  if (usedKwh >= Number(session.paidKwh)) await stopSession(session.id, 'budget_reached');
}

/* ---- (4) Send the stop command (settlement happens on StopTransaction) -- */
export async function stopSession(sessionId: string, reason: string) {
  const session = await db.query.chargingSessions.findFirst({
    where: eq(chargingSessions.id, sessionId),
    with: { connector: { with: { charger: true } } },
  });
  if (!session?.ocppTransactionId) return;
  await db.update(chargingSessions).set({ stopReason: reason }).where(eq(chargingSessions.id, sessionId));
  try {
    await registry.call((session.connector as any).charger.chargeboxId,
      'RemoteStopTransaction', { transactionId: session.ocppTransactionId }, 30_000);
  } catch { /* charger will also stop on its own; settle on StopTransaction */ }
}

/* ---- (5) Charger reports the stop -> finalise + refund leftover --------- */
export async function onStopTransaction(transactionId: number, meterStop: number | null, reason: string) {
  const session = await db.query.chargingSessions.findFirst({
    where: eq(chargingSessions.ocppTransactionId, transactionId),
    with: { connector: { with: { priceGroup: true } } },
  });
  if (!session) return;

  const pricePerKwh = Number((session.connector as any).priceGroup?.pricePerKwh ?? 0);
  let usedKwh = Number(session.kwh ?? 0);
  if (meterStop != null && session.startMeterWh != null) {
    usedKwh = Math.max(0, (meterStop - session.startMeterWh) / 1000);
  }
  const paidKwh = Number(session.paidKwh);
  const status = usedKwh >= paidKwh - 1e-6 ? 'completed' : 'stopped_early';

  await db.update(chargingSessions).set({
    endMeterWh: meterStop ?? undefined, kwh: usedKwh.toFixed(3),
    status, stoppedAt: new Date(), stopReason: session.stopReason ?? reason,
  }).where(eq(chargingSessions.id, session.id));

  const payment = await db.query.payments.findFirst({
    where: eq(payments.sessionId, session.id), with: { driver: true },
  });
  if (!payment) return;

  const refund = Math.max(0, Number(payment.baseAmount) - usedKwh * pricePerKwh);
  await refunds.issueRefund(payment.id, refund, 'unused_balance');
  if (payment.driver) {
    await notify.sendInvoiceEmail(payment.driver, {
      kwh: usedKwh, base: Number(payment.baseAmount), gst: Number(payment.gstAmount),
      txn: Number(payment.txnFee), total: Number(payment.totalAmount), refund,
    });
  }
}

/* ---- failure path: full refund (operator absorbs fee per config) -------- */
async function failAndRefund(payment: any, reason: string, sessionId?: string) {
  if (sessionId) {
    await db.update(chargingSessions)
      .set({ status: 'failed_to_start', stopReason: reason, stoppedAt: new Date() })
      .where(eq(chargingSessions.id, sessionId));
  }
  const amount = config.refundAbsorbsGatewayFee
    ? Number(payment.totalAmount)
    : Number(payment.baseAmount) + Number(payment.gstAmount);
  await refunds.issueRefund(payment.id, amount, reason);
}

async function loadConnector(chargeboxId: string, connectorNo: number) {
  const charger = await db.query.chargers.findFirst({ where: eq(chargers.chargeboxId, chargeboxId) });
  if (!charger) return null;
  return db.query.connectors.findFirst({
    where: and(eq(connectors.chargerId, charger.id), eq(connectors.connectorNo, connectorNo)),
    with: { charger: true, priceGroup: true },
  });
}
