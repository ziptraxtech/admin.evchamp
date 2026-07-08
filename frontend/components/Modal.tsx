'use client';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

export default function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 2000, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border-strong)', borderRadius: 14, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--panel)', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          <button onClick={onClose} className="icon-btn" style={{ fontSize: 20, padding: '2px 8px', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}
