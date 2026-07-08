'use client';

import { useEffect, useState } from 'react';

export default function SettingsView({ gateway }: { gateway: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') as 'dark' | 'light';
    setTheme(t || 'dark');
  }, []);

  function applyTheme(t: 'dark' | 'light') {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('evchamp_theme', t); } catch {}
    setTheme(t);
  }

  return (
    <div className="card" style={{ padding: 24, maxWidth: 600 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 20px' }}>Backend Configuration</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
        {[
          ['API Base URL', process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api'],
          ['OCPP WebSocket', 'ws://localhost:9220/{chargeboxId}'],
          ['Database', 'NeonDB (dev · ap-southeast-1)'],
          ['Payment Gateway', gateway || '—'],
        ].map(([l, v]) => (
          <div key={l}><div className="lbl">{l}</div><div className="inset-box">{v}</div></div>
        ))}
      </div>
      <div style={{ marginTop: 20 }}>
        <div className="lbl">Appearance</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => applyTheme('dark')} className="btn-ghost"
            style={{ borderColor: theme === 'dark' ? 'var(--accent)' : 'var(--border-strong)' }}>🌙 Dark</button>
          <button onClick={() => applyTheme('light')} className="btn-ghost"
            style={{ borderColor: theme === 'light' ? 'var(--accent)' : 'var(--border-strong)' }}>☀ Light</button>
        </div>
      </div>
    </div>
  );
}
