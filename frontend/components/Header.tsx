'use client';

import { useState, useEffect } from 'react';
import { adminGet } from '@/lib/api';

interface HeaderProps {
  title: string;
  crumb: string;
  onRefresh: () => void;
}

export default function Header({ title, crumb, onRefresh }: HeaderProps) {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const t = document.documentElement.getAttribute('data-theme') as 'dark' | 'light';
    setTheme(t || 'dark');
    ping();
  }, []);

  async function ping() {
    try { await adminGet('/dashboard'); setApiOk(true); }
    catch { setApiOk(false); }
  }

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('evchamp_theme', next); } catch {}
    setTheme(next);
  }

  const dotColor = apiOk === null ? 'var(--muted)' : apiOk ? 'var(--c-teal)' : 'var(--c-red)';
  const apiLabel = apiOk === null ? 'checking…' : apiOk ? 'API connected' : 'API offline';

  return (
    <header style={{ height: 56, background: 'var(--panel)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{crumb}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: dotColor, background: 'var(--inset)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'inline-block', marginRight: 5 }} />
          {apiLabel}
        </div>
        <button onClick={toggleTheme} className="btn-ghost" style={{ padding: '6px 10px' }} aria-label="Toggle theme">
          {theme === 'light' ? (
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"/></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/></svg>
          )}
        </button>
        <button onClick={onRefresh} className="btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }}><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/></svg>
          Refresh
        </button>
      </div>
    </header>
  );
}
