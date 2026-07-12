'use client';

import { useEffect, useState } from 'react';
import { adminGet, adminSend, fmtTime } from '@/lib/api';
import Modal from '@/components/Modal';

interface User { userId: string; companyName: string; createdAt?: string }

export default function UsersView() {
  const [users, setUsers] = useState<User[]>([]);
  const [err, setErr] = useState(false);
  const [modal, setModal] = useState<null | 'add' | { pw: string }>(null); // 'add' | {pw: userId}
  const [form, setForm] = useState({ userId: '', password: '' });
  const [pwForm, setPwForm] = useState('');
  const [saving, setSaving] = useState(false);

  const me = typeof window !== 'undefined' ? localStorage.getItem('evchamp_userId') || '' : '';

  useEffect(() => { load(); }, []);

  async function load() {
    try { setUsers(await adminGet<User[]>('/users')); setErr(false); }
    catch { setErr(true); }
  }

  async function addUser() {
    if (!form.userId.trim() || form.password.length < 6) { alert('User ID and a password of at least 6 characters are required.'); return; }
    setSaving(true);
    const r = await adminSend('/users', 'POST', { userId: form.userId.trim(), password: form.password });
    setSaving(false);
    if (r.ok) { setModal(null); load(); } else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  async function changePassword(userId: string) {
    if (pwForm.length < 6) { alert('Password must be at least 6 characters.'); return; }
    setSaving(true);
    const r = await adminSend(`/users/${encodeURIComponent(userId)}/password`, 'PUT', { password: pwForm });
    setSaving(false);
    if (r.ok) { setModal(null); alert(`Password updated for "${userId}".`); } else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  async function deleteUser(userId: string) {
    if (!confirm(`Delete login "${userId}"? This cannot be undone.`)) return;
    const r = await adminSend(`/users/${encodeURIComponent(userId)}`, 'DELETE');
    if (r.ok) load(); else alert('Failed: ' + (r.body.error || 'unknown'));
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Operator logins for this organization. Add teammates or change passwords.</p>
        <button onClick={() => { setForm({ userId: '', password: '' }); setModal('add'); }} className="btn-primary">+ Add User</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>User ID</th><th>Company</th><th>Created</th><th></th></tr></thead>
          <tbody>
            {err ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--c-red)' }}>API offline.</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>No users yet.</td></tr>
            ) : users.map(u => (
              <tr key={u.userId}>
                <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {u.userId}{u.userId === me && <span className="badge" style={{ marginLeft: 8, background: 'var(--bg-blue)', color: 'var(--fg-blue)' }}>you</span>}
                </td>
                <td style={{ color: 'var(--text-soft)' }}>{u.companyName}</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{u.createdAt ? fmtTime(u.createdAt) : '—'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => { setPwForm(''); setModal({ pw: u.userId }); }} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px', marginRight: 8 }}>Change password</button>
                  {u.userId !== me && (
                    <button onClick={() => deleteUser(u.userId)} className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px', color: 'var(--c-red)', borderColor: 'var(--border)' }}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add user */}
      {modal === 'add' && (
        <Modal title="Add User" onClose={() => setModal(null)}>
          <label className="lbl">User ID *</label>
          <input value={form.userId} onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} className="inp" style={{ marginBottom: 12 }} placeholder="e.g. operator2" autoComplete="off" />
          <label className="lbl">Password * <span style={{ textTransform: 'none', color: 'var(--muted)', fontWeight: 400 }}>(min 6 chars)</span></label>
          <input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="inp" style={{ marginBottom: 20 }} placeholder="••••••••" type="text" autoComplete="new-password" />
          <button onClick={addUser} disabled={saving} className="modal-submit">{saving ? 'Creating…' : 'Create User'}</button>
        </Modal>
      )}

      {/* Change password */}
      {modal && typeof modal === 'object' && 'pw' in modal && (
        <Modal title={`Change Password — ${modal.pw}`} onClose={() => setModal(null)}>
          <label className="lbl">New password <span style={{ textTransform: 'none', color: 'var(--muted)', fontWeight: 400 }}>(min 6 chars)</span></label>
          <input value={pwForm} onChange={e => setPwForm(e.target.value)} className="inp" style={{ marginBottom: 20 }} placeholder="••••••••" type="text" autoComplete="new-password" />
          <button onClick={() => changePassword(modal.pw)} disabled={saving} className="modal-submit">{saving ? 'Updating…' : 'Update Password'}</button>
        </Modal>
      )}
    </div>
  );
}
