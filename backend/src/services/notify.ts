// Driver notifications. Stubs for now — wire to an email provider (Resend/SES) and
// an SMS/WhatsApp provider later. Email is required, phone optional, so SMS is best-effort.

interface Driver { email: string; phone?: string | null }

export async function sendInvoiceEmail(driver: Driver, invoice: Record<string, unknown>) {
  // TODO: render GST invoice (base, GST, txn, total, refund) and email it.
  console.log(`[notify] invoice → ${driver.email}`, invoice);
}

export async function sendRefundNotice(driver: Driver, amount: number, reason: string) {
  // TODO: email (+ SMS if phone present): "Charger unavailable — ₹X refunded".
  console.log(`[notify] refund ₹${amount.toFixed(2)} (${reason}) → ${driver.email}${driver.phone ? ' / ' + driver.phone : ''}`);
}
