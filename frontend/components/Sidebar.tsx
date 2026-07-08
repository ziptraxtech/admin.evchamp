'use client';

import type { View } from '@/lib/types';

interface SidebarProps {
  view: View;
  onNav: (v: View) => void;
  onLogout: () => void;
}

const NAV = [
  { group: 'Overview', items: [
    { view: 'dashboard' as View, label: 'Dashboard', icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path d="M2 4a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H4a2 2 0 01-2-2V4zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V4zM2 13a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H4a2 2 0 01-2-2v-3zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2v-3z"/></svg> },
    { view: 'transactions' as View, label: 'Transactions', icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg> },
  ]},
  { group: 'Infrastructure', items: [
    { view: 'stations' as View, label: 'Stations', icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg> },
    { view: 'chargers' as View, label: 'Charge Points', icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/></svg> },
    { view: 'rfid' as View, label: 'RFID Tags', icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg> },
  ]},
  { group: 'Finance', items: [
    { view: 'pricing' as View, label: 'Price Groups', icon: <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/></svg> },
  ]},
];

export default function Sidebar({ view, onNav, onLogout }: SidebarProps) {
  const company = typeof window !== 'undefined' ? localStorage.getItem('evchamp_company') || 'Operator' : 'Operator';
  const userId = typeof window !== 'undefined' ? localStorage.getItem('evchamp_userId') || '' : '';

  return (
    <aside style={{ width: 224, flexShrink: 0, background: 'var(--panel)', borderRight: '1px solid var(--border)', position: 'fixed', height: '100vh', display: 'flex', flexDirection: 'column', zIndex: 30 }}>
      {/* Logo */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#14b8a6,#0d9488)', borderRadius: 9, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(13,148,136,.35)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill="#fff"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>EvChamp <span style={{ color: 'var(--accent-bright)' }}>Pay</span></div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Operator Console</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
        {NAV.map(section => (
          <div key={section.group}>
            <div className="nav-group" style={{ paddingTop: section.group !== 'Overview' ? 14 : undefined }}>{section.group}</div>
            {section.items.map(item => (
              <a key={item.view} className={`nav-link${view === item.view || (view === 'charger-detail' && item.view === 'chargers') ? ' active' : ''}`}
                onClick={() => onNav(item.view)} style={{ userSelect: 'none' }}>
                {item.icon}{item.label}
              </a>
            ))}
          </div>
        ))}
        <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0' }} />
        <a className={`nav-link${view === 'settings' ? ' active' : ''}`} onClick={() => onNav('settings')}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
          Settings
        </a>
      </nav>

      {/* User footer */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--inset)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#14b8a6,#0d9488)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff' }}>
            {company.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{company}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userId}</div>
          </div>
          <button onClick={onLogout} title="Sign out" className="icon-btn">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h6a1 1 0 110 2H3a3 3 0 01-3-3V4a3 3 0 013-3h6a1 1 0 010 2H3zm10.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H7a1 1 0 110-2h7.586l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
