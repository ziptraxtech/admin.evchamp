'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authLogin, AUTH_DISABLED } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Login removed for now — skip the form and go straight to the dashboard.
    if (AUTH_DISABLED || localStorage.getItem('evchamp_token')) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await authLogin(userId.trim(), password);
      localStorage.setItem('evchamp_token', data.token);
      localStorage.setItem('evchamp_company', data.companyName);
      localStorage.setItem('evchamp_userId', data.userId);
      router.push('/dashboard');
    } catch (ex) {
      setError((ex as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#0b1220', position: 'relative', display: 'flex' }}>
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)',
        backgroundSize: '36px 36px',
      }} />
      {/* Glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(900px 500px at 10% 10%,rgba(16,185,129,.18),transparent 60%),radial-gradient(800px 500px at 90% 90%,rgba(13,148,136,.16),transparent 55%)',
      }} />

      <div style={{ position: 'relative', display: 'flex', width: '100%', color: '#f1f5f9' }}>
        {/* Brand panel — desktop only */}
        <div style={{ display: 'none', width: '50%', flexDirection: 'column', justifyContent: 'space-between', padding: 48 }} className="lg-panel">
          <style>{`@media(min-width:1024px){.lg-panel{display:flex!important}}`}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#34d399,#0d9488)', display: 'grid', placeItems: 'center', boxShadow: '0 4px 20px rgba(13,148,136,.4)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="#fff"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>EvChamp <span style={{ color: '#2dd4bf' }}>Pay</span></div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: -1 }}>Charge Point Management & Payments</div>
            </div>
          </div>
          <div style={{ maxWidth: 420 }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>Power every charger.<br/>Get paid instantly.</h1>
            <p style={{ marginTop: 16, color: 'rgba(203,213,225,.8)', lineHeight: 1.6 }}>Per-charger QR codes, Razorpay & UPI payments, and automatic session start over OCPP — all from one dashboard.</p>
            <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
              {[['40+', 'Chargers managed'], ['UPI', 'Razorpay + Paytm'], ['OCPP', 'Auto-start sessions']].map(([v, l]) => (
                <div key={l} style={{ borderRadius: 14, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', padding: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#2dd4bf' }}>{v}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#334155' }}>© 2026 EvChamp Pay</div>
        </div>

        {/* Login card */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ borderRadius: 20, background: '#fff', color: '#0f172a', boxShadow: '0 32px 80px rgba(0,0,0,.5)', padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,#34d399,#0d9488)', display: 'grid', placeItems: 'center' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="#fff"/></svg>
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>EvChamp <span style={{ color: '#0d9488' }}>Pay</span></div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Operator Console</div>
                </div>
              </div>

              <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Welcome back</h2>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>Sign in to your operator dashboard</p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>User ID</label>
                  <div style={{ position: 'relative' }}>
                    <svg style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <input value={userId} onChange={e => setUserId(e.target.value)} type="text" autoComplete="username" placeholder="e.g. zipbolt" required
                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 10, paddingLeft: 40, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <svg style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password" placeholder="••••••••" required
                      style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 10, paddingLeft: 40, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                </div>

                {error && (
                  <div style={{ borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3', padding: '10px 12px', fontSize: 13, color: '#e11d48' }}>{error}</div>
                )}

                <button type="submit" disabled={loading}
                  style={{ borderRadius: 10, background: 'linear-gradient(135deg,#10b981,#0d9488)', color: '#fff', fontWeight: 600, padding: '11px 0', fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}>
                  {loading ? 'Signing in…' : 'Sign in to dashboard'}
                </button>
              </form>
            </div>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#334155', marginTop: 20 }}>
              Need a station onboarded? <a href="#" style={{ color: '#2dd4bf', fontWeight: 500 }}>Contact EvChamp</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
