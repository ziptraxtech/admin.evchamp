// Payment intent lifecycle for the customer app — the two phases:
//   createIntent : capture email/amount, make a 'created' payment BEFORE money moves
//   confirm      : the gateway webhook says paid -> 'captured' -> start the session
// Keeping confirm on the webhook (not the button) means a closed tab can't stop charging.

import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chargers, connectors, drivers, payments } from '../db/schema.js';
import { quoteByAmount } from './pricing.js';
import * as sessions from './sessions.js';

type IntentInput = {
  chargeboxId: string; connectorNo: number; baseAmount: number; email: string; phone?: string;
};
type IntentResult =
  | { ok: true; paymentId: string; breakdown: ReturnType<typeof quoteByAmount> }
  | { ok: false; error: string; min?: number };

export async function createIntent(input: IntentInput): Promise<IntentResult> {
  const charger = await db.query.chargers.findFirst({ where: eq(chargers.chargeboxId, input.chargeboxId) });
  if (!charger) return { ok: false, error: 'charger_not_found' };

  const connector = await db.query.connectors.findFirst({
    where: and(eq(connectors.chargerId, charger.id), eq(connectors.connectorNo, Number(input.connectorNo))),
    with: { priceGroup: true },
  });
  if (!connector) return { ok: false, error: 'connector_not_found' };
  if (connector.status !== 'available') return { ok: false, error: 'connector_unavailable' };

  const pg = (connector as any).priceGroup;
  const price = Number(pg?.pricePerKwh ?? 15);
  const min = Number(pg?.minRecharge ?? 300);
  // input.baseAmount carries the tax-inclusive total the customer agreed to pay
  const q = quoteByAmount(Number(input.baseAmount), price, Number(pg?.gstPct ?? 18), Number(pg?.txnPct ?? 2));
  if (q.total < min) return { ok: false, error: 'below_minimum', min };

  // email is required (for the invoice); phone optional
  if (!input.email) return { ok: false, error: 'email_required' };
  let driver = await db.query.drivers.findFirst({ where: eq(drivers.email, input.email) });
  if (!driver) [driver] = await db.insert(drivers).values({ email: input.email, phone: input.phone }).returning();
  else if (input.phone && !driver.phone) await db.update(drivers).set({ phone: input.phone }).where(eq(drivers.id, driver.id));

  const [payment] = await db.insert(payments).values({
    connectorId: connector.id, driverId: driver.id, provider: 'razorpay',
    baseAmount: q.base.toFixed(2), gstAmount: q.gst.toFixed(2), txnFee: q.txn.toFixed(2),
    totalAmount: q.total.toFixed(2), status: 'created',
  }).returning();

  return { ok: true, paymentId: payment.id, breakdown: q };
}

// Called by the Razorpay webhook (or the dev endpoint). Idempotent: only a 'created'
// payment is advanced, so retried webhooks won't double-start.
export async function confirm(paymentId: string, providerRef: string) {
  const payment = await db.query.payments.findFirst({ where: eq(payments.id, paymentId) });
  if (!payment) return null;
  if (payment.status !== 'created') return payment; // already processed

  await db.update(payments).set({ status: 'captured', providerRef }).where(eq(payments.id, paymentId));
  sessions.startSessionAfterPayment(paymentId).catch((e) => console.error('[start] error', e));
  return payment;
}
