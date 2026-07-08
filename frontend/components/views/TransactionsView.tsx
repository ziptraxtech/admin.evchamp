'use client';

import { useEffect, useState } from 'react';
import { adminGet, inr, fmtTime } from '@/lib/api';

interface Txn { txnId: string; connector: string; provider: string; kwh: number; amount: number; refund?: number; status: string; time: string }

const pill = (s: string) => {
  const MAP: Record<string, string> = { settled:'green', captured:'amber', committed:'amber', refunded:'blue', failed:'red', created:'grey', completed:'green' };
  const g = MAP[s] || 'grey';
  return <span className="badge" style={{ background: `var(--bg-${g})`, color: `var(--fg-${g})` }}>{s}</span>;
};

export default function TransactionsView() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [err, setErr] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setTxns(await adminGet<Txn[]>('/transactions')); setErr(false); }
    catch { setErr(true); }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Payments reconciled to charging sessions (last 100).</p>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>Txn ID</th><th>Connector</th><th>Provider</th><th>kWh</th><th>Amount</th><th>Refund</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            {err ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--c-red)' }}>API offline.</td></tr>
            ) : txns.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No transactions yet.</td></tr>
            ) : txns.map(x => (
              <tr key={x.txnId}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{x.txnId}</td>
                <td style={{ color: 'var(--text-soft)' }}>{x.connector}</td>
                <td style={{ color: 'var(--muted)' }}>{x.provider}</td>
                <td>{Number(x.kwh).toFixed(2)}</td>
                <td style={{ fontWeight: 600, color: 'var(--text)' }}>{inr(x.amount)}</td>
                <td style={{ color: 'var(--muted)' }}>{x.refund ? inr(x.refund) : '—'}</td>
                <td>{pill(x.status)}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtTime(x.time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
