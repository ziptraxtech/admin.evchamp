// Refunds — issue a gateway refund and record it on the payment.
// Used in two cases: (1) unused-balance settlement, (2) charger-failure full refund.

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { payments, drivers } from '../db/schema.js';
import * as notify from './notify.js';

export async function issueRefund(paymentId: string, amount: number, reason: string) {
  if (amount <= 0) {
    await db.update(payments).set({ status: 'settled', settledAt: new Date() }).where(eq(payments.id, paymentId));
    return;
  }

  // TODO: call Razorpay Refunds API here (refund against payment.providerRef).
  //   await razorpay.payments.refund(providerRef, { amount: Math.round(amount * 100) });
  // Refunds are idempotent on the gateway side; guard re-entry with payment.status.

  await db.update(payments)
    .set({ refundAmount: amount.toFixed(2), status: 'refunded', settledAt: new Date() })
    .where(eq(payments.id, paymentId));

  const pay = await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
    with: { driver: true },
  });
  if (pay?.driver) await notify.sendRefundNotice(pay.driver as typeof drivers.$inferSelect, amount, reason);

  console.log(`[refund] ₹${amount.toFixed(2)} for payment ${paymentId} (${reason})`);
}
