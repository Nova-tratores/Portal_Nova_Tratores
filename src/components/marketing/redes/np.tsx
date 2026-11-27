'use client';
// Peças do estilo NewPortal (docs/estilo-pos-newportal.md) usadas nas telas do módulo Site (12/11/2026):
// sem negrito, sem caixa alta, texto escuro, cartão 16, ícone em quadradinho, campo com borda visível e explicação embaixo.
import type { CSSProperties, ReactNode } from 'react';

// ---- Estilo NewPortal (docs/estilo-pos-newportal.md): sem negrito, sem caixa alta, texto escuro, cartão 16, ícone em quadradinho
// 27/11/2026 (José, docs/design-marketing.md): "nenhuma cor cinza". Neutros quentes creme/areia/café; as variáveis
// --nt-* (claro e escuro) vão na página pelo EstiloNP. O valor depois da vírgula é o do modo claro (caso falte o estilo).
export const T1 = 'var(--nt-texto, #2B1D17)';
// 25/11/2026 (José: "tá difícil de ler"): o cinza do portal (#737373 / #a3a3a3) some no fundo claro.
// T2 e T3 agora saem do texto principal com transparência: escuros no claro, claros no escuro.
export const T2 = 'var(--nt-texto-2, #6B5547)';
export const T3 = 'var(--nt-texto-3, #8C7464)';
/** Fundo e borda de cartão: --surface/--border só existem dentro do Pós-Vendas; fora dele o cartão ficava transparente. */
export const FUNDO = 'var(--nt-superficie, #FFFFFF)';
export const BORDA = 'var(--nt-borda, #E8DCCD)';
export const BORDA_FORTE = 'var(--nt-borda-forte, #D6C4B0)';
export const SUP2 = 'var(--nt-superficie-2, #F5EEE6)';
export const SUP3 = 'var(--nt-superficie-3, #EDE3D7)';
/** Cores que SIGNIFICAM algo (e só elas): marca (1 botão por tela, a Nova nos gráficos), bom, atenção, informação. */
export const MARCA = 'var(--nt-marca, #D7262C)';
export const BOM = 'var(--nt-bom, #2E7D4F)';
export const ATENCAO = 'var(--nt-atencao, #B7791F)';
export const INFO = 'var(--nt-info, #1F6FA8)';
/** Neutro para botão secundário e coisas sem significado (no lugar do antigo cinza #64748b). */
export const NEUTRO = 'var(--nt-texto-2, #6B5547)';
export const AZUL = INFO;
/** Concorrentes nos gráficos: café → areia (a Nova é sempre MARCA). */
export const CAFES = ['#6B5547', '#8C7464', '#A8907D', '#C2AC98', '#D6C4B0', '#E8DCCD'];
export const SOMBRA = '0 8px 24px rgba(43, 29, 23, 0.10)';
export const cartaoNP: CSSProperties = { background: FUNDO, border: `1px solid ${BORDA}`, borderRadius: 16, padding: '16px 18px 14px', minWidth: 0 };
export const campoNP: CSSProperties = {
  width: '100%', minHeight: 44, padding: '8px 12px', borderRadius: 10, boxSizing: 'border-box', font: 'inherit', fontSize: 15,
  border: `1px solid ${BORDA_FORTE}`, background: FUNDO, color: T1,
};
export const bt = (cor: string, cheio = false): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '8px 16px', borderRadius: 10, font: 'inherit', fontSize: 15, fontWeight: 400,
  cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap',
  border: `1px solid ${cheio ? cor : `color-mix(in srgb, ${cor} 35%, ${BORDA_FORTE})`}`,
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

// `cor` ficou só por compatibilidade: título de seção não leva cor (docs/design-marketing.md, 1.3)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Secao({ icone, cor = AZUL, titulo, sub, children }: { icone: string; cor?: string; titulo: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ ...cartaoNP, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Quadradinho icone={icone} cor={NEUTRO} />
        <span style={{ display: 'grid', minWidth: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: T1 }}>{titulo}</span>
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
      {ajuda && <span style={{ fontSize: 13, color: T3, lineHeight: 1.45 }}>{ajuda}</span>}
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
      :root {
        --nt-fundo: #FBF7F2; --nt-superficie: #FFFFFF; --nt-superficie-2: #F5EEE6; --nt-superficie-3: #EDE3D7;
        --nt-borda: #E8DCCD; --nt-borda-forte: #D6C4B0;
        --nt-texto: #2B1D17; --nt-texto-2: #6B5547; --nt-texto-3: #8C7464;
        --nt-marca: #D7262C; --nt-marca-hover: #B81E23; --nt-marca-suave: #FDECEC; --nt-marca-texto: #A11A1F; --nt-sobre-marca: #FFFFFF;
        --nt-bom: #2E7D4F; --nt-bom-suave: #E7F4EC; --nt-atencao: #B7791F; --nt-atencao-suave: #FDF3E1; --nt-info: #1F6FA8; --nt-info-suave: #E6F0F8;
      }
      [data-theme="dark"] {
        --nt-fundo: #17110E; --nt-superficie: #211915; --nt-superficie-2: #2A201B; --nt-superficie-3: #352821;
        --nt-borda: #3A2C24; --nt-borda-forte: #4E3B30;
        --nt-texto: #F6EEE6; --nt-texto-2: #C9B6A6; --nt-texto-3: #9C8676;
        --nt-marca: #F0464B; --nt-marca-hover: #F7686C; --nt-marca-suave: #3A1A1A; --nt-marca-texto: #FFB3B5;
        --nt-bom: #5CC48A; --nt-bom-suave: #1C3326; --nt-atencao: #E8A94A; --nt-atencao-suave: #3A2A12; --nt-info: #6BB0E3; --nt-info-suave: #162B3B;
      }
      .np-sobe { transition: transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s cubic-bezier(.2,.8,.2,1), border-color .18s ease; }
      .np-sobe:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(43,29,23,.10); border-color: var(--nt-borda-forte) !important; }
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
