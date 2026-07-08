'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { adminGet, adminSend } from '@/lib/api';
import Modal from '@/components/Modal';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

interface Station {
  id: string; name: string; address?: string;
  lat?: number | null; lng?: number | null;
  online: number; chargers: number;
}

export default function StationsView() {
  const [stations, setStations] = useState<Station[]>([]);
  const [err, setErr] = useState(false);
  const [modal, setModal] = useState<null | 'add' | Station>(null);
  const [form, setForm] = useState({ name: '', address: '', lat: '', lng: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setStations(await adminGet<Station[]>('/stations')); setErr(false); }
    catch { setErr(true); }
  }

  function openAdd() { setForm({ name: '', address: '', lat: '', lng: '' }); setModal('add'); }
  function openEdit(s: Station) { setForm({ name: s.name, address: s.address || '', lat: s.lat ? String(s.lat) : '', lng: s.lng ? String(s.lng) : '' }); setModal(s); }

  async function save() {
    setSaving(true);
    const body = { name: form.name.trim(), address: form.address.trim(), lat: form.lat ? parseFloat(form.lat) : null, lng: form.lng ? parseFloat(form.lng) : null };
    const r = modal === 'add'
      ? await adminSend('/stations', 'POST', body)
      : await adminSend('/stations/' + (modal as Station).id, 'PUT', body);
    setSaving(false);
    if (r.ok) { setModal(null); load(); } else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Physical station locations — set coordinates to place them on the map.</p>
        <button onClick={openAdd} className="btn-primary">+ Add Station</button>
      </div>

      <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
        <LeafletMap stations={stations} height={340} />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>Station</th><th>Address</th><th>Chargers</th><th>Online</th><th>Coordinates</th><th></th></tr></thead>
          <tbody>
            {err ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--c-red)' }}>API offline.</td></tr>
            ) : stations.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No stations yet.</td></tr>
            ) : stations.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{s.address || '—'}</td>
                <td>{s.chargers}</td>
                <td style={{ fontWeight: 600, color: s.online > 0 ? 'var(--c-teal)' : 'var(--muted)' }}>{s.online}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                  {s.lat && s.lng ? `${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)}` : <span style={{ color: 'var(--c-red)' }}>not set</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button onClick={() => openEdit(s)} style={{ fontSize: 12, color: 'var(--accent-bright)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Station' : 'Edit Station'} onClose={() => setModal(null)}>
          <div className="section-divider">Location Details</div>
          <label className="lbl">Station Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="inp" style={{ marginBottom: 12 }} placeholder="e.g. Andheri Hub" />
          <label className="lbl">Address</label>
          <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="inp" style={{ marginBottom: 20 }} placeholder="Full address" />
          <div className="section-divider">Map Coordinates <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}>(optional)</span></div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Find on <a href="https://www.openstreetmap.org" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-bright)' }}>openstreetmap.org</a> — right-click → &quot;Show address&quot;</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div><label className="lbl">Latitude</label><input type="number" step="any" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} className="inp" placeholder="19.1190" /></div>
            <div><label className="lbl">Longitude</label><input type="number" step="any" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} className="inp" placeholder="72.8468" /></div>
          </div>
          <button onClick={save} disabled={saving} className="modal-submit">{saving ? 'Saving…' : modal === 'add' ? 'Create Station' : 'Save Changes'}</button>
        </Modal>
      )}
    </div>
  );
}
