'use client';
// Peças do estilo NewPortal (docs/estilo-pos-newportal.md) usadas nas telas do módulo Site (12/11/2026):
// sem negrito, sem caixa alta, texto escuro, cartão 16, ícone em quadradinho, campo com borda visível e explicação embaixo.
import type { CSSProperties, ReactNode } from 'react';

// ---- Estilo NewPortal (docs/estilo-pos-newportal.md): sem negrito, sem caixa alta, texto escuro, cartão 16, ícone em quadradinho
export const T1 = 'var(--portal-text, #0f172a)';
export const T2 = 'var(--portal-text-secondary, #475569)';
export const T3 = 'var(--portal-text-muted, #64748b)';
export const AZUL = '#2563eb';
export const cartaoNP: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px 14px', minWidth: 0 };
export const campoNP: CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', borderRadius: 10, boxSizing: 'border-box', font: 'inherit', fontSize: 14,
  border: '1px solid color-mix(in srgb, var(--portal-text, #0f172a) 18%, transparent)', background: 'var(--surface)', color: T1,
};
export const bt = (cor: string, cheio = false): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '8px 14px', borderRadius: 11, font: 'inherit', fontSize: 14, fontWeight: 500,
  cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
  border: `1px solid ${cheio ? cor : `color-mix(in srgb, ${cor} 30%, var(--border))`}`,
  background: cheio ? cor : 'var(--surface)', color: cheio ? '#fefefe' : cor,
});
export const ic = (nome: string) => <i className={`fa-solid ${nome}`} style={{ fontWeight: 900 }} />;

export function Quadradinho({ icone, cor, tam = 32 }: { icone: string; cor: string; tam?: number }) {
  return (
    <span style={{ flex: 'none', width: tam, height: tam, borderRadius: tam > 32 ? 11 : 9, display: 'grid', placeItems: 'center', fontSize: tam > 32 ? 16 : 14,
      color: cor, background: `color-mix(in srgb, ${cor} 9%, var(--surface))`, border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)` }}>
      {ic(icone)}
    </span>
  );
}

export function Secao({ icone, cor = AZUL, titulo, sub, children }: { icone: string; cor?: string; titulo: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ ...cartaoNP, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Quadradinho icone={icone} cor={cor} />
        <span style={{ display: 'grid', minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: T1 }}>{titulo}</span>
          {sub && <span style={{ fontSize: 13, color: T3 }}>{sub}</span>}
        </span>
      </div>
      {children}
    </section>
  );
}

export function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 5, alignContent: 'start', minWidth: 0 }}>
      <span style={{ fontSize: 13, color: T2 }}>{rotulo}</span>
      {children}
      {ajuda && <span style={{ fontSize: 12, color: T3, lineHeight: 1.45 }}>{ajuda}</span>}
    </label>
  );
}

export const grade = (min: number): CSSProperties => ({ display: 'grid', gap: 14, gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` });

