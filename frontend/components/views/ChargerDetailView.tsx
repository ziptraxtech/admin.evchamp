'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { adminGet, adminSend, fmtTime, PAY_BASE } from '@/lib/api';
import Modal from '@/components/Modal';

interface ConnectorData {
  id: string; connectorNo: number; name?: string; type?: string;
  powerKw: number; voltageV: number; pricePerKwh: number;
  status: string; priceGroupId?: string; priceGroup?: string;
}
interface PriceGroup { id: string; name: string; pricePerKwh: number }
interface ChargerData {
  chargeboxId: string; name?: string; station?: string; address?: string;
  online: boolean; status: string; isPublic: boolean; chargerKind: string;
  ocpp: string; lastHeartbeat?: string; connectors: ConnectorData[];
}
interface Session { connectorNo: number; driver: string; kwh: string; paidKwh: string; status: string; startedAt?: string; createdAt?: string }

const pill = (s: string) => {
  const MAP: Record<string, string> = { online:'green', offline:'grey', available:'green', unavailable:'grey', Public:'blue', Private:'grey', AC:'blue', DC:'purple', completed:'green', stopped_early:'amber', failed_to_start:'red', pending_start:'grey', charging:'amber' };
  const g = MAP[s] || 'grey';
  return <span className="badge" style={{ background: `var(--bg-${g})`, color: `var(--fg-${g})` }}>{s}</span>;
};

const CONNECTOR_TYPES = ['Type 1','Type 2','Type 6','Type 7','CCS1','CCS2','CHAdeMO','GBT DC'];

export default function ChargerDetailView({ chargeboxId, onBack }: { chargeboxId: string; onBack: () => void }) {
  const [charger, setCharger] = useState<ChargerData | null>(null);
  const [pgs, setPgs] = useState<PriceGroup[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tab, setTab] = useState<'connectors' | 'sessions' | 'qr'>('connectors');
  const [modal, setModal] = useState<null | 'edit-charger' | ConnectorData>(null);
  const [editForm, setEditForm] = useState({ name: '', kind: 'AC', isPublic: true });
  const [connForm, setConnForm] = useState({ name: '', type: 'Type 2', powerKw: '', voltageV: '', pgId: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [chargeboxId]);

  async function load() {
    const [c, p, s] = await Promise.all([
      adminGet<ChargerData>('/chargers/' + chargeboxId),
      adminGet<PriceGroup[]>('/price-groups'),
      adminGet<Session[]>('/chargers/' + chargeboxId + '/sessions').catch(() => []),
    ]);
    setCharger(c); setPgs(p); setSessions(s as Session[]);
  }

  function openEditCharger() {
    if (!charger) return;
    setEditForm({ name: charger.name || '', kind: charger.chargerKind, isPublic: charger.isPublic });
    setModal('edit-charger');
  }

  function openEditConnector(c: ConnectorData) {
    setConnForm({ name: c.name || '', type: c.type || 'Type 2', powerKw: String(c.powerKw), voltageV: String(c.voltageV), pgId: c.priceGroupId || '' });
    setModal(c);
  }

  async function saveCharger() {
    setSaving(true);
    const r = await adminSend('/chargers/' + chargeboxId, 'PUT', { name: editForm.name.trim() || null, chargerKind: editForm.kind, isPublic: editForm.isPublic });
    setSaving(false);
    if (r.ok) { setModal(null); load(); } else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  async function saveConnector(connectorId: string) {
    setSaving(true);
    const r = await adminSend('/connectors/' + connectorId, 'PUT', { name: connForm.name || null, connectorType: connForm.type, powerKw: parseFloat(connForm.powerKw), voltageV: parseFloat(connForm.voltageV), priceGroupId: connForm.pgId });
    setSaving(false);
    if (r.ok) { setModal(null); load(); } else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  const payUrl = `${PAY_BASE}/?c=${chargeboxId}`;

  if (!charger) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, fontFamily: 'inherit' }}>
        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
        Back to Charge Points
      </button>

      {/* Header card */}
      <div className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{charger.name || charger.chargeboxId}</h2>
              {pill(charger.online ? 'online' : 'offline')} {pill(charger.isPublic ? 'Public' : 'Private')} {pill(charger.chargerKind)}
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>ID {charger.chargeboxId} · {charger.station || '—'} · OCPP {charger.ocpp} · Last heartbeat {fmtTime(charger.lastHeartbeat)}</p>
            {charger.address && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{charger.address}</p>}
          </div>
          <button onClick={openEditCharger} className="btn-ghost">Edit Charger</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
          {(['connectors','sessions','qr'] as const).map(t => (
            <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'qr' ? 'QR Code' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ padding: 20 }}>

          {/* Connectors tab */}
          {tab === 'connectors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {charger.connectors.map(x => {
                const avail = x.status === 'available';
                return (
                  <div key={x.connectorNo} style={{ border: `1px solid ${avail ? 'var(--accent)' : 'var(--border-strong)'}`, borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--inset)', borderBottom: '1px solid var(--border)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                        <span style={{ width: 28, height: 28, background: 'var(--accent-soft)', borderRadius: '50%', display: 'grid', placeItems: 'center' }}>⚡</span>
                        CONNECTOR {x.connectorNo}{x.name ? ` · ${x.name}` : ''}
                      </div>
                      <span className="badge" style={avail ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--bg-grey)', color: 'var(--fg-grey)' }}>● {x.status.toUpperCase()}</span>
                    </div>
                    <div style={{ padding: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, fontSize: 13, marginBottom: 14 }}>
                        {[['Type', x.type || '—'], ['Power', `${x.powerKw.toFixed(2)} kW`], ['Voltage', `${x.voltageV.toFixed(2)} V`], ['Price Group', `${x.priceGroup || '—'}\n₹${x.pricePerKwh}/kWh`]].map(([l, v]) => (
                          <div key={l}><div className="lbl">{l}</div><div className="inset-box" style={{ fontFamily: 'inherit', color: 'var(--text-soft)', whiteSpace: 'pre-line', lineHeight: 1.4 }}>{v}</div></div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ width: 56, height: 56, background: '#fff', borderRadius: 9, display: 'grid', placeItems: 'center' }}>
                          <QRCodeSVG value={payUrl} size={48} level="M" />
                        </div>
                        <button onClick={() => openEditConnector(x)} className="btn-ghost">Edit Connector</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sessions tab */}
          {tab === 'sessions' && (
            sessions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontSize: 13 }}>No sessions yet for this charger.</div>
            ) : (
              <table className="data-table">
                <thead><tr><th>Connector</th><th>Driver</th><th>kWh delivered</th><th>Status</th><th>Started</th></tr></thead>
                <tbody>
                  {sessions.map((s, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'monospace' }}>C{s.connectorNo}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.driver}</td>
                      <td>{Number(s.kwh).toFixed(2)} / {Number(s.paidKwh).toFixed(2)}</td>
                      <td>{pill(s.status)}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtTime(s.startedAt || s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {/* QR tab */}
          {tab === 'qr' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '8px 0' }}>
              <div style={{ width: 200, height: 200, background: '#fff', borderRadius: 14, display: 'grid', placeItems: 'center' }}>
                <QRCodeSVG value={payUrl} size={188} level="M" />
              </div>
              <div className="inset-box" style={{ textAlign: 'center', maxWidth: 320, wordBreak: 'break-all' }}>{payUrl}</div>
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', maxWidth: 280 }}>Print this sticker and attach it to the charger. Driver scans → selects connector → pays.</p>
              <a href={payUrl} target="_blank" rel="noreferrer" className="btn-primary" style={{ textDecoration: 'none', padding: '9px 24px' }}>Open pay page ↗</a>
            </div>
          )}
        </div>
      </div>

      {/* Edit charger modal */}
      {modal === 'edit-charger' && (
        <Modal title={`Edit Charger · ${chargeboxId}`} onClose={() => setModal(null)}>
          <label className="lbl">Charger Name</label>
          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="inp" style={{ marginBottom: 12 }} placeholder="e.g. Andheri Hub – Bay 1" />
          <label className="lbl">Charger Type</label>
          <select value={editForm.kind} onChange={e => setEditForm(f => ({ ...f, kind: e.target.value }))} className="inp" style={{ marginBottom: 12 }}>
            <option value="AC">AC</option><option value="DC">DC</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', marginBottom: 20, color: 'var(--text-soft)' }}>
            <input type="checkbox" checked={editForm.isPublic} onChange={e => setEditForm(f => ({ ...f, isPublic: e.target.checked }))} style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
            Public (visible to all drivers)
          </label>
          <button onClick={saveCharger} disabled={saving} className="modal-submit">{saving ? 'Saving…' : 'Save Changes'}</button>
        </Modal>
      )}

      {/* Edit connector modal */}
      {modal && typeof modal === 'object' && 'connectorNo' in modal && (
        <Modal title={`Edit Connector ${(modal as ConnectorData).connectorNo}`} onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label className="lbl">Display Name</label><input value={connForm.name} onChange={e => setConnForm(f => ({ ...f, name: e.target.value }))} className="inp" placeholder="CN1" /></div>
            <div><label className="lbl">Connector Type</label>
              <select value={connForm.type} onChange={e => setConnForm(f => ({ ...f, type: e.target.value }))} className="inp">
                {CONNECTOR_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="lbl">Power (kW)</label><input type="number" step="0.01" value={connForm.powerKw} onChange={e => setConnForm(f => ({ ...f, powerKw: e.target.value }))} className="inp" /></div>
            <div><label className="lbl">Voltage (V)</label><input type="number" step="0.01" value={connForm.voltageV} onChange={e => setConnForm(f => ({ ...f, voltageV: e.target.value }))} className="inp" /></div>
          </div>
          <label className="lbl">Price Group</label>
          <select value={connForm.pgId} onChange={e => setConnForm(f => ({ ...f, pgId: e.target.value }))} className="inp" style={{ marginBottom: 20 }}>
            {pgs.map(p => <option key={p.id} value={p.id}>{p.name} — ₹{p.pricePerKwh}/kWh</option>)}
          </select>
          <button onClick={() => saveConnector((modal as ConnectorData).id)} disabled={saving} className="modal-submit">{saving ? 'Saving…' : 'Save Changes'}</button>
        </Modal>
      )}
    </div>
  );
}
