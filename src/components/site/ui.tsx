'use client';
// Kit visual do módulo Site (estilo POS NewPortal: cartão 16px, borda fina, sem faixa lateral, pesos 400/500).
import { useEffect, useState, type ReactNode } from 'react';

export const tela: React.CSSProperties = { padding: 'clamp(12px, 2vw, 28px)', display: 'grid', gap: 16 };

export const cartao: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(14px, 1.6vw, 20px)', minWidth: 0,
};

export const real = (n: number | null | undefined, centavos = false) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: centavos ? 2 : 0 });

export const quando = (iso: string) => {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

export const duracao = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`);

/** Número que conta até o valor (respeita quem pediu menos movimento). */
export function Conta({ valor, formato = (n: number) => n.toLocaleString('pt-BR') }: { valor: number; formato?: (n: number) => string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(valor); return; }
    let raf = 0; const t0 = performance.now();
    const passo = (t: number) => { const k = Math.min(1, (t - t0) / 700); setV(valor * (1 - (1 - k) ** 3)); if (k < 1) raf = requestAnimationFrame(passo); };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <>{formato(v)}</>;
}

/** Cartão de número: ícone num quadradinho, rótulo e valor. Clicável quando recebe onClick (filtra a lista). */
export function Numero({ icone, cor, rotulo, valor, detalhe, ativo, onClick }: {
  icone: string; cor: string; rotulo: string; valor: ReactNode; detalhe?: ReactNode; ativo?: boolean; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      style={{
        ...cartao, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', font: 'inherit', color: 'inherit',
        cursor: onClick ? 'pointer' : 'default', outline: ativo ? `2px solid ${cor}` : 'none', transition: 'transform .15s',
      }}
      onMouseEnter={(e) => { if (onClick) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ''; }}
    >
      <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${cor} 9%, transparent)`, color: cor }}>
        <i className={`fa-solid ${icone}`} style={{ fontWeight: 900 }} />
      </span>
      <span style={{ display: 'grid', minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--portal-text-muted, #6b7280)' }}>{rotulo}</span>
        <span style={{ fontSize: 24, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'var(--portal-text)' }}>{valor}</span>
        {detalhe && <span style={{ fontSize: 12, color: 'var(--portal-text-muted, #6b7280)' }}>{detalhe}</span>}
      </span>
    </Tag>
  );
}

export function grade(min: number): React.CSSProperties {
  return { display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` };
}

/** "Como ler esta tela" — fechado, abre ao tocar. */
export function ComoLer({ children }: { children: ReactNode }) {
  return (
    <details style={{ ...cartao, padding: '10px 16px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--portal-text)' }}>
        <i className="fa-solid fa-circle-question" style={{ fontWeight: 900, color: '#dc2626', marginRight: 8 }} />Como ler esta tela
      </summary>
      <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6, color: 'var(--portal-text)' }}>{children}</div>
    </details>
  );
}

export function Aviso({ children, tom = 'erro' }: { children: ReactNode; tom?: 'erro' | 'info' }) {
  const cor = tom === 'erro' ? '#dc2626' : '#0284c7';
  return (
    <div style={{ ...cartao, borderColor: `color-mix(in srgb, ${cor} 40%, var(--border))`, background: `color-mix(in srgb, ${cor} 6%, var(--surface))`, fontSize: 14 }}>
      {children}
    </div>
  );
}

export const botao = (cor = '#dc2626', cheio = true): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '8px 14px', borderRadius: 10,
  border: `1px solid ${cheio ? cor : 'var(--border)'}`, background: cheio ? cor : 'var(--surface)',
  color: cheio ? '#fefefe' : 'var(--portal-text)', font: 'inherit', fontSize: 14, fontWeight: 500, cursor: 'pointer', textDecoration: 'none',
});

export const campo: React.CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--portal-text)', font: 'inherit', fontSize: 14, boxSizing: 'border-box',
};
