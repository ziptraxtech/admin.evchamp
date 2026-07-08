'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminSend, inr } from '@/lib/api';
import Modal from '@/components/Modal';

interface PriceGroup {
  id: string; name: string; description?: string; priceType: string;
  currency: string; gateway: string; gstPct: number; txnPct: number;
  chargesBearer: string; minRecharge: number; pricePerKwh: number; connectors: number;
}

type Form = Omit<PriceGroup, 'id' | 'connectors' | 'pricePerKwh' | 'gstPct' | 'txnPct' | 'minRecharge'> & { pricePerKwh: string; gstPct: string; txnPct: string; minRecharge: string };

const pill = (s: string) => {
  const MAP: Record<string, string> = { variable: 'purple', fixed: 'grey' };
  const g = MAP[s] || 'grey';
  return <span className="badge" style={{ background: `var(--bg-${g})`, color: `var(--fg-${g})` }}>{s}</span>;
};

const DEFAULT: Form = { name: '', description: '', priceType: 'fixed', currency: 'INR', gateway: 'razorpay', gstPct: '18', txnPct: '2', chargesBearer: 'customer', minRecharge: '300', pricePerKwh: '15' };

export default function PricingView({ onGatewayLoaded }: { onGatewayLoaded?: (gw: string) => void }) {
  const [pgs, setPgs] = useState<PriceGroup[]>([]);
  const [err, setErr] = useState(false);
  const [modal, setModal] = useState<null | 'new' | string>(null);
  const [form, setForm] = useState<Form>(DEFAULT);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await adminGet<PriceGroup[]>('/price-groups');
      setPgs(data); setErr(false);
      if (data[0] && onGatewayLoaded) onGatewayLoaded(data[0].gateway);
    } catch { setErr(true); }
  }

  async function openModal(id?: string) {
    if (id) {
      const p = await adminGet<PriceGroup>('/price-groups/' + id).catch(() => null);
      if (p) setForm({ ...p, pricePerKwh: String(p.pricePerKwh), gstPct: String(p.gstPct), txnPct: String(p.txnPct), minRecharge: String(p.minRecharge) });
      setModal(id);
    } else { setForm(DEFAULT); setModal('new'); }
  }

  async function save() {
    if (!form.name.trim()) { alert('Name is required'); return; }
    setSaving(true);
    const body = { ...form, pricePerKwh: form.pricePerKwh, gstPct: form.gstPct, txnPct: form.txnPct, minRecharge: form.minRecharge };
    const r = modal === 'new'
      ? await adminSend('/price-groups', 'POST', body)
      : await adminSend('/price-groups/' + modal, 'PUT', body);
    setSaving(false);
    if (r.ok) { setModal(null); load(); } else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Manage pricing schemes for connectors.</p>
        <button onClick={() => openModal()} className="btn-primary">+ Add Price Group</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Description</th><th>Type</th><th>₹ / kWh</th><th>GST %</th><th>Min ₹</th><th>Connectors</th><th></th></tr></thead>
          <tbody>
            {err ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--c-red)' }}>API offline.</td></tr>
            ) : pgs.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No price groups yet.</td></tr>
            ) : pgs.map(p => (
              <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openModal(p.id)}>
                <td style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.description || '—'}</td>
                <td>{pill(p.priceType)}</td>
                <td style={{ fontWeight: 600, color: 'var(--text)' }}>₹{Number(p.pricePerKwh).toFixed(2)}</td>
                <td>{Number(p.gstPct).toFixed(0)}%</td>
                <td>{inr(p.minRecharge)}</td>
                <td>{p.connectors}</td>
                <td style={{ fontSize: 12, color: 'var(--accent-bright)', fontWeight: 600 }}>edit →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'New Price Group' : 'Edit Price Group'} onClose={() => setModal(null)}>
          <div className="section-divider">Basic Info</div>
          <label className="lbl">Name *</label>
          <input value={form.name} onChange={set('name')} className="inp" style={{ marginBottom: 12 }} placeholder="e.g. Zipbolt Standard" />
          <label className="lbl">Description</label>
          <input value={form.description || ''} onChange={set('description')} className="inp" style={{ marginBottom: 20 }} placeholder="Optional description" />
          <div className="section-divider">Payment Config</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <div><label className="lbl">Currency</label><input value={form.currency} onChange={set('currency')} className="inp" /></div>
            <div><label className="lbl">Gateway</label>
              <select value={form.gateway} onChange={set('gateway')} className="inp">
                {['razorpay','paytm','upi'].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div><label className="lbl">GST %</label><input type="number" step="0.01" value={form.gstPct} onChange={set('gstPct')} className="inp" /></div>
            <div><label className="lbl">Transaction fee %</label><input type="number" step="0.01" value={form.txnPct} onChange={set('txnPct')} className="inp" /></div>
            <div><label className="lbl">Charges bearer</label>
              <select value={form.chargesBearer} onChange={set('chargesBearer')} className="inp">
                <option value="customer">Customer (EV driver)</option>
                <option value="operator">Operator</option>
              </select>
            </div>
            <div><label className="lbl">Min recharge (₹)</label><input type="number" value={form.minRecharge} onChange={set('minRecharge')} className="inp" /></div>
          </div>
          <div className="section-divider">Pricing</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {(['fixed','variable'] as const).map(pt => (
              <label key={pt} style={{ border: `1px solid ${form.priceType === pt ? 'var(--accent)' : 'var(--border-strong)'}`, background: form.priceType === pt ? 'var(--accent-soft)' : 'transparent', borderRadius: 9, padding: 12, cursor: 'pointer', fontSize: 13, color: 'var(--text-soft)' }}>
                <input type="radio" name="pt" value={pt} checked={form.priceType === pt} onChange={() => setForm(f => ({ ...f, priceType: pt }))} style={{ accentColor: 'var(--accent)', marginRight: 6 }} />
                {pt === 'fixed' ? 'Fixed Pricing' : 'Variable Pricing'}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{pt === 'fixed' ? 'Single rate for all times' : 'Different per day/time'}</div>
              </label>
            ))}
          </div>
          <label className="lbl">Price per kWh (₹)</label>
          <input type="number" step="0.01" value={form.pricePerKwh} onChange={set('pricePerKwh')} className="inp" style={{ marginBottom: 20 }} />
          <button onClick={save} disabled={saving} className="modal-submit">{saving ? 'Saving…' : modal === 'new' ? 'Create Price Group' : 'Save Changes'}</button>
        </Modal>
      )}
    </div>
  );
}
