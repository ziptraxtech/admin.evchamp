// Pricing — tax-INCLUSIVE model:
//   the amount the customer enters IS the total payable; GST + txn are carved out of it.
//   total  →  base = total / ((1+gst)(1+txn))  →  GST on base  →  txn = remainder
//   kWh = base / pricePerKwh
// e.g. total 300, gst18, txn2, ₹15/kWh  →  base 249.25, GST 44.87, txn 5.88, ~16.6 kWh
// (txn is taken as the remainder so base + GST + txn always foots exactly to the total.)

export interface Breakdown {
  kwh: number; base: number; gst: number; txn: number; total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function quoteByAmount(total: number, pricePerKwh: number, gstPct: number, txnPct: number): Breakdown {
  const t = r2(total);
  const g = gstPct / 100, x = txnPct / 100;
  const base = r2(t / ((1 + g) * (1 + x)));
  const gst = r2(base * g);
  const txn = r2(t - base - gst); // remainder → ledger foots exactly to the entered total
  return { base, gst, txn, total: t, kwh: r3(base / pricePerKwh) };
}

export function quoteByKwh(kwh: number, pricePerKwh: number, gstPct: number, txnPct: number): Breakdown {
  // kWh × price is the inclusive total the customer commits to paying.
  return quoteByAmount(kwh * pricePerKwh, pricePerKwh, gstPct, txnPct);
}
