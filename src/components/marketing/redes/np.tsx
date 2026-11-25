'use client';
// Peças do estilo NewPortal (docs/estilo-pos-newportal.md) usadas nas telas do módulo Site (12/11/2026):
// sem negrito, sem caixa alta, texto escuro, cartão 16, ícone em quadradinho, campo com borda visível e explicação embaixo.
import type { CSSProperties, ReactNode } from 'react';

// ---- Estilo NewPortal (docs/estilo-pos-newportal.md): sem negrito, sem caixa alta, texto escuro, cartão 16, ícone em quadradinho
export const T1 = 'var(--portal-text, #0f172a)';
// 25/11/2026 (José: "tá difícil de ler"): o cinza do portal (#737373 / #a3a3a3) some no fundo claro.
// T2 e T3 agora saem do texto principal com transparência: escuros no claro, claros no escuro.
export const T2 = 'color-mix(in srgb, var(--portal-text, #0f172a) 88%, transparent)';
export const T3 = 'color-mix(in srgb, var(--portal-text, #0f172a) 74%, transparent)';
/** Fundo e borda de cartão: --surface/--border só existem dentro do Pós-Vendas; fora dele o cartão ficava transparente. */
export const FUNDO = 'var(--surface, var(--portal-bg-card, #ffffff))';
export const BORDA = 'var(--border, color-mix(in srgb, var(--portal-text, #0f172a) 12%, transparent))';
export const AZUL = '#2563eb';
export const cartaoNP: CSSProperties = { background: FUNDO, border: `1px solid ${BORDA}`, borderRadius: 16, padding: '16px 18px 14px', minWidth: 0 };
export const campoNP: CSSProperties = {
  width: '100%', minHeight: 40, padding: '8px 12px', borderRadius: 10, boxSizing: 'border-box', font: 'inherit', fontSize: 14,
  border: '1px solid color-mix(in srgb, var(--portal-text, #0f172a) 18%, transparent)', background: 'var(--surface)', color: T1,
};
export const bt = (cor: string, cheio = false): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '8px 14px', borderRadius: 11, font: 'inherit', fontSize: 14, fontWeight: 500,
  cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
  border: `1px solid ${cheio ? cor : `color-mix(in srgb, ${cor} 30%, var(--border))`}`,
  background: cheio ? cor : FUNDO, color: cheio ? '#fefefe' : cor, transition: 'transform .15s ease, box-shadow .15s ease',
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


/** Voltar padrão do módulo Site (José, 12/11: "esse voltar está esquisito"): trilha "← Calendário › Novo post",
 *  sem cartão em volta. O primeiro pedaço é um botão de verdade (borda visível); o segundo diz onde a pessoa está. */
export function Voltar({ para, atual, onClick, direita }: { para: string; atual: string; onClick: () => void; direita?: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
      <button type="button" onClick={onClick}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 38, padding: '6px 14px 6px 10px', borderRadius: 10, font: 'inherit', fontSize: 14, cursor: 'pointer',
          border: '1px solid color-mix(in srgb, var(--portal-text, #0f172a) 22%, transparent)', background: 'var(--portal-bg-secondary, #fff)', color: T1 }}>
        <i className="fa-solid fa-chevron-left" style={{ fontWeight: 900, fontSize: 12 }} />{para}
      </button>
      <i className="fa-solid fa-chevron-right" style={{ fontWeight: 900, fontSize: 10, color: T3 }} />
      <span style={{ fontSize: 16, color: T1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 auto' }}>{atual}</span>
      {direita && <span style={{ marginLeft: 'auto' }}>{direita}</span>}
    </div>
  );
}

/**
 * Movimento das telas de Redes (25/11/2026, José: "deixa algo mais animado, dinâmico"). Vai uma vez na página
 * (pelo SubAbas). Classes: np-sobe (cartão sobe no mouse), np-entra (aparece subindo), np-barra (barra cresce
 * da esquerda), np-coluna (coluna cresce de baixo). Quem pediu menos movimento no sistema não vê animação.
 */
export function EstiloNP() {
  return (
    <style>{`
      .np-sobe { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
      .np-sobe:hover { transform: translateY(-3px); box-shadow: 0 12px 26px -14px rgba(15,23,42,.45); }
      @keyframes npEntra { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      .np-entra { animation: npEntra .45s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes npCresce { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      .np-barra { transform-origin: left center; animation: npCresce .8s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes npColuna { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      .np-coluna { transform-origin: center bottom; animation: npColuna .6s cubic-bezier(.2,.8,.2,1) both; }
      @media (prefers-reduced-motion: reduce) { .np-sobe, .np-entra, .np-barra, .np-coluna { animation: none !important; transition: none !important; } }
    `}</style>
  );
}
