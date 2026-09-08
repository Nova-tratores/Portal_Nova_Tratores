'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';
import { ROSA_CLARO, ROSA_ESCURO } from './ui';

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
          borderRadius: 4,
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            background: `linear-gradient(135deg, ${ROSA_CLARO}, ${ROSA_ESCURO})`,
            borderRadius: '3px 3px 0 0',
          }}
        >
          <strong style={{ fontSize: 15, color: '#111111' }}>{titulo}</strong>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#111111', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}
