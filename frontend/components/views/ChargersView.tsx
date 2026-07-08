'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminSend } from '@/lib/api';
import Modal from '@/components/Modal';

interface Charger {
  chargeboxId: string; name?: string; address?: string; station?: string;
  chargerKind: string; connectors: number; isPublic: boolean;
  online: boolean; status: string; lastHeartbeat?: string;
}

const pill = (s: string) => {
  const MAP: Record<string, string> = { online:'green', offline:'grey', available:'green', unavailable:'grey', Public:'blue', Private:'grey', AC:'blue', DC:'purple' };
  const g = MAP[s] || 'grey';
  return <span className="badge" style={{ background: `var(--bg-${g})`, color: `var(--fg-${g})` }}>{s}</span>;
};
const fmtTime = (t?: string) => t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function ChargersView({ onOpenCharger }: { onOpenCharger: (id: string) => void }) {
  const [chargers, setChargers] = useState<Charger[]>([]);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: '', kind: 'AC', isPublic: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setChargers(await adminGet<Charger[]>('/chargers')); setErr(false); }
    catch { setErr(true); }
  }

  async function create() {
    setSaving(true);
    const r = await adminSend('/chargers', 'POST', { name: form.name.trim() || null, chargerKind: form.kind, isPublic: form.isPublic });
    setSaving(false);
    if (r.ok) { setModal(false); alert(`Charger ${r.body.chargeboxId} created. Configure the physical device to connect with this ID.`); load(); }
    else if (r.body.error === 'need a station and price group first') { setModal(false); alert('Setup needed: create a Station and a Price Group first, then add chargers.'); }
    else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  const filtered = chargers.filter(c => !search || [c.chargeboxId, c.name, c.address, c.station, c.status].join(' ').toLowerCase().includes(search.toLowerCase()));
  const total = chargers.length, active = chargers.filter(c => c.online).length, pub = chargers.filter(c => c.isPublic).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Manage and monitor your charging infrastructure.</p>
        <button onClick={() => setModal(true)} className="btn-primary">+ Add Charger</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
        {[['Total Chargers', total, ''], ['Online Now', active, '--c-teal'], ['Offline', total - active, '--c-red'], ['Public / Private', `${pub} / ${total - pub}`, '--c-blue']].map(([l, v, c]) => (
          <div key={String(l)} className="kpi">
            <div className="kpi-label">{l}</div>
            <div className="kpi-value" style={c ? { color: `var(${c})`, fontSize: 22 } : { fontSize: 22 }}>{String(v)}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID, name, address, status…" className="inp" style={{ maxWidth: 380 }} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>ID</th><th>Name</th><th>Station / Address</th><th>Type</th><th>Conn.</th><th>Visibility</th><th>Status</th><th>Heartbeat</th><th></th></tr></thead>
          <tbody>
            {err ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--c-red)' }}>API offline.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No chargers match.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.chargeboxId} style={{ cursor: 'pointer' }} onClick={() => onOpenCharger(c.chargeboxId)}>
                <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{c.chargeboxId}</td>
                <td style={{ color: 'var(--text-soft)' }}>{c.name || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>{c.station || ''}{c.address ? <><br/>{c.address}</> : null}</td>
                <td>{pill(c.chargerKind)}</td>
                <td>{c.connectors}</td>
                <td>{pill(c.isPublic ? 'Public' : 'Private')}</td>
                <td>{pill(c.online ? 'online' : c.status)}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtTime(c.lastHeartbeat)}</td>
                <td style={{ color: 'var(--muted)', fontSize: 16 }}>›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="Add Charger" onClose={() => setModal(false)}>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 20px' }}>Chargebox ID is auto-assigned (next free 0001–9999). Configure the physical charger to connect with that ID over OCPP.</p>
          <div className="section-divider">Charger Details</div>
          <label className="lbl">Charger Name</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="inp" style={{ marginBottom: 12 }} placeholder="e.g. Andheri Hub – Bay 1" />
          <label className="lbl">Charger Type</label>
          <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))} className="inp" style={{ marginBottom: 12 }}>
            <option value="AC">AC</option><option value="DC">DC</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 20, color: 'var(--text-soft)' }}>
            <input type="checkbox" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
            Public (visible to all drivers)
          </label>
          <button onClick={create} disabled={saving} className="modal-submit">{saving ? 'Creating…' : 'Create Charger'}</button>
        </Modal>
      )}
    </div>
  );
}
