'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminSend } from '@/lib/api';
import Modal from '@/components/Modal';

interface Tag { token: string; driver?: string; blocked: boolean }

const pill = (s: string, color: string) => <span className="badge" style={{ background: `var(--bg-${color})`, color: `var(--fg-${color})` }}>{s}</span>;

export default function RfidView() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [err, setErr] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ token: '', blocked: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setTags(await adminGet<Tag[]>('/rfid')); setErr(false); }
    catch { setErr(true); }
  }

  async function save() {
    if (!form.token.trim()) { alert('Tag token required'); return; }
    setSaving(true);
    const r = await adminSend('/rfid', 'POST', { token: form.token.trim(), blocked: form.blocked });
    setSaving(false);
    if (r.ok) { setModal(false); load(); } else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  const active = tags.filter(t => !t.blocked).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Manage RFID tags linked to drivers.</p>
        <button onClick={() => { setForm({ token: '', blocked: false }); setModal(true); }} className="btn-primary">+ Add RFID Tag</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 16 }}>
        {[['Total Tags', tags.length, ''], ['Active', active, '--c-teal'], ['Blocked', tags.length - active, '--c-red']].map(([l, v, c]) => (
          <div key={String(l)} className="kpi">
            <div className="kpi-label">{l}</div>
            <div className="kpi-value" style={c ? { color: `var(${c})`, fontSize: 22 } : { fontSize: 22 }}>{String(v)}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>RFID Tag</th><th>Driver</th><th>Status</th></tr></thead>
          <tbody>
            {err ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 32, color: 'var(--c-red)' }}>API offline.</td></tr>
            ) : tags.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No RFID tags issued yet.</td></tr>
            ) : tags.map(t => (
              <tr key={t.token}>
                <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{t.token}</td>
                <td style={{ color: 'var(--text-soft)' }}>{t.driver || '—'}</td>
                <td>{pill(t.blocked ? 'Blocked' : 'Active', t.blocked ? 'red' : 'green')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title="Add RFID Tag" onClose={() => setModal(false)}>
          <label className="lbl">RFID Tag Token *</label>
          <input value={form.token} onChange={e => setForm(f => ({ ...f, token: e.target.value }))} className="inp" style={{ marginBottom: 12 }} placeholder="e.g. 53714 or A1B2C3" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 20, color: 'var(--text-soft)' }}>
            <input type="checkbox" checked={form.blocked} onChange={e => setForm(f => ({ ...f, blocked: e.target.checked }))} style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
            Start as blocked
          </label>
          <button onClick={save} disabled={saving} className="modal-submit">{saving ? 'Adding…' : 'Add Tag'}</button>
        </Modal>
      )}
    </div>
  );
}
