'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { adminGet, inr, fmtTime } from '@/lib/api';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

const pill = (s: string) => {
  const MAP: Record<string, string> = { online:'green', offline:'grey', available:'green', charging:'amber', unavailable:'grey', settled:'green', captured:'amber', refunded:'blue', failed:'red', completed:'green', stopped_early:'amber', failed_to_start:'red' };
  const g = MAP[s] || 'grey';
  return <span className="badge" style={{ background: `var(--bg-${g})`, color: `var(--fg-${g})` }}>{s}</span>;
};

export default function DashboardView({ onViewChargers }: { onViewChargers: () => void }) {
  const [kpis, setKpis] = useState<{ revenueToday: number; activeSessions: number; kwhToday: number; chargersOnline: number; chargersTotal: number } | null>(null);
  const [stations, setStations] = useState<Array<{ name: string; address?: string; lat?: number; lng?: number; online: number; chargers: number }>>([]);
  const [txns, setTxns] = useState<Array<{ connector: string; provider: string; time: string; amount: number; status: string }>>([]);
  const [err, setErr] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setErr(false);
    try {
      const [d, s, t] = await Promise.all([
        adminGet<typeof kpis & {}>('/dashboard'),
        adminGet<typeof stations>('/stations'),
        adminGet<typeof txns>('/transactions'),
      ]);
      setKpis(d as typeof kpis);
      setStations(s as typeof stations);
      setTxns((t as typeof txns).slice(0, 8));
    } catch { setErr(true); }
  }

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        {[
          ['Revenue today', kpis ? inr(kpis.revenueToday) : '—'],
          ['Active sessions', kpis ? String(kpis.activeSessions) : '—'],
          ['Energy today', kpis ? `${Number(kpis.kwhToday).toFixed(1)} kWh` : '—'],
          ['Chargers online', kpis ? `${kpis.chargersOnline} / ${kpis.chargersTotal}` : '—'],
        ].map(([label, val]) => (
          <div key={label} className="kpi"><div className="kpi-label">{label}</div><div className="kpi-value" style={{ fontSize: 22 }}>{val}</div></div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header">
            <h3>Station Map</h3>
            <button onClick={onViewChargers} style={{ fontSize: 12, color: 'var(--accent-bright)', background: 'none', border: 'none', cursor: 'pointer' }}>Manage →</button>
          </div>
          <LeafletMap stations={stations} height={300} />
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header"><h3>Stations</h3></div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {err ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--c-red)', fontSize: 13 }}>API offline.</div>
            ) : stations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 13 }}>No stations yet.</div>
            ) : stations.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{s.address || 'No address'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: s.online > 0 ? 'var(--c-teal)' : 'var(--muted)' }}>{s.online} online</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.chargers} chargers</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-header"><h3>Recent Transactions</h3></div>
        {err ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--c-red)', fontSize: 13 }}>API offline.</div>
        ) : txns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>No transactions yet.</div>
        ) : txns.map((x, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{x.connector}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{x.provider} · {fmtTime(x.time)}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{inr(x.amount)}</div>
              {pill(x.status)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
