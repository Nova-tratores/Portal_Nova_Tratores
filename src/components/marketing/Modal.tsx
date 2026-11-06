'use client';
import { useEffect } from 'react';
import { Megaphone, X } from 'lucide-react';
import { IconeQuadrado, ROSA } from './ui';

// Modal central do módulo. Fecha no Esc e no clique fora — nunca prende quem
// abriu por engano no meio de uma feira.
export default function Modal({
  titulo, aberto, onFechar, children, largura = 760,
}: {
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
  children: React.ReactNode;
  largura?: number;
}) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aberto, onFechar]);

  if (!aberto) return null;

  return (
    <div
      onClick={onFechar}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '5vh 12px', overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: largura,
          background: 'var(--portal-bg-card)',
          border: '1px solid var(--portal-border)',
          borderRadius: 16,
          boxShadow: '0 24px 60px -24px rgba(15,23,42,.55)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid var(--portal-border)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 500, color: 'var(--portal-text)', minWidth: 0 }}>
            <IconeQuadrado cor={ROSA}><Megaphone size={16} /></IconeQuadrado>
            {titulo}
          </span>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            style={{ background: 'var(--portal-bg-secondary, #f1f5f9)', border: 'none', borderRadius: 10, cursor: 'pointer', color: 'var(--portal-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 36, minHeight: 36, flex: 'none' }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}
