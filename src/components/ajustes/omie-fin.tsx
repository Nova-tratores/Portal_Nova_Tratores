'use client';
// Kit visual das telas financeiras de /ajustes (Correção de contas, Baixar
// contas, Boletos de fornecedor, Antecipações) no MESMO desenho das janelas
// Omie do POS/PPV (components/pos/OSOmieAbas.tsx): verde-petróleo #0F8B8D,
// rótulo em cima da caixa, grade com cabeçalho cinza em maiúsculas, botões-
// pílula com contorno, janela com faixa cinza e "Fechar ✕", rodapé
// "1 - N de N registros". Só aparência — nenhuma regra de negócio aqui.
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const TEAL = '#0F8B8D';
export const TEAL_ESC = '#0B6E70';

const CSS = `
.ofin, .ofin-overlay { --ofin-sup: var(--portal-bg-card, #fefefe); --ofin-borda: var(--portal-border, #d7dee3); --ofin-cinza: var(--portal-bg-secondary, #f4f6f7); }
.ofin-overlay input[type=checkbox] { accent-color: ${TEAL}; width: 15px; height: 15px; cursor: pointer; }
.ofin {
  padding: clamp(12px, 2vw, 24px); padding-top: 14px; font-size: 13px; color: var(--portal-text, #1f2d3d); }
.ofin input[type=checkbox], .ofin input[type=radio] { accent-color: ${TEAL}; width: 15px; height: 15px; cursor: pointer; }

.ofin-topo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ofin-topo h1 { margin: 0; font-size: 20px; font-weight: 600; color: ${TEAL_ESC}; line-height: 1.2; }
.ofin-topo .ofin-sub { font-size: 12.5px; color: #6b7a89; }
.ofin-topo .ofin-direita { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.ofin-comoler { margin: -4px 0 14px; font-size: 12.5px; color: #4b5b6b; }
.ofin-comoler > summary { cursor: pointer; color: ${TEAL}; font-weight: 600; list-style: none; display: inline-flex; align-items: center; gap: 6px; user-select: none; }
.ofin-comoler > summary::-webkit-details-marker { display: none; }
.ofin-comoler > div { margin-top: 8px; padding: 12px 16px; border-radius: 10px; background: color-mix(in srgb, ${TEAL} 6%, var(--ofin-sup)); line-height: 1.6; max-width: 980px; }
.ofin-comoler a { color: ${TEAL}; font-weight: 600; }

.ofin-cartao { background: var(--ofin-sup); border: 1px solid var(--ofin-borda); border-radius: 12px; margin-bottom: 14px; }
.ofin-filtros { padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
.ofin-filtros-pe { padding: 0 16px 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 12px; color: #6b7a89; }

.ofin-lbl { display: block; font-size: 11.5px; font-weight: 600; color: #6b7a89; margin: 0 0 5px 2px; text-transform: none; letter-spacing: 0; }
.ofin-lbl.apagado { color: #c2cbd3; }
.ofin-inp { display: block; width: 100%; box-sizing: border-box; min-height: 38px; margin: 0; padding: 0 12px; border: 1px solid var(--ofin-borda); border-radius: 8px;
  background: var(--ofin-sup); color: var(--portal-text, #1f2d3d); font-size: 13px; font-family: inherit; box-shadow: none; transition: border-color .15s, box-shadow .15s; }
.ofin-inp:focus { outline: none; border-color: ${TEAL}; box-shadow: 0 0 0 3px rgba(15,139,141,.12); }
.ofin-inp:disabled { background: var(--ofin-cinza); opacity: .6; cursor: not-allowed; }
.ofin-inp.num { text-align: right; font-variant-numeric: tabular-nums; }
textarea.ofin-inp { padding: 9px 12px; min-height: 64px; resize: vertical; line-height: 1.45; }
select.ofin-inp { cursor: pointer; }
.ofin-inp.mudou { border-color: #f59e0b; background: color-mix(in srgb, #f59e0b 6%, var(--ofin-sup)); }
.ofin-leitura { min-height: 38px; display: flex; align-items: center; padding: 0 12px; border: 1px solid var(--ofin-borda); border-radius: 8px; background: var(--ofin-cinza); font-size: 13px; }

.ofin-seg { display: inline-flex; height: 38px; border: 1px solid var(--ofin-borda); border-radius: 9px; overflow: hidden; background: var(--ofin-sup); }
.ofin-seg button { border: none; border-left: 1px solid var(--ofin-borda); background: transparent; padding: 0 14px; font-family: inherit; font-size: 12.5px; font-weight: 600; color: #6b7a89; cursor: pointer; white-space: nowrap; }
.ofin-seg button:first-child { border-left: none; }
.ofin-seg button:hover { color: ${TEAL_ESC}; }
.ofin-seg button.ativo { background: color-mix(in srgb, ${TEAL} 12%, var(--ofin-sup)); color: ${TEAL_ESC}; box-shadow: inset 0 -2px 0 ${TEAL}; }

.ofin-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 9px; border: 1px solid ${TEAL};
  background: color-mix(in srgb, ${TEAL} 7%, var(--ofin-sup)); color: ${TEAL_ESC}; font-weight: 700; font-size: 12.5px; cursor: pointer; font-family: inherit; white-space: nowrap; transition: background .12s; }
.ofin-btn:hover:not(:disabled) { background: color-mix(in srgb, ${TEAL} 15%, var(--ofin-sup)); }
.ofin-btn:disabled { opacity: .45; cursor: not-allowed; }
.ofin-btn.prim { background: ${TEAL}; border-color: ${TEAL}; color: #fefefe; }
.ofin-btn.prim:hover:not(:disabled) { background: ${TEAL_ESC}; }
.ofin-btn.neutro { border-color: var(--ofin-borda); background: transparent; color: #5b6b7b; }
.ofin-btn.neutro:hover:not(:disabled) { background: var(--ofin-cinza); }
.ofin-btn.perigo { border-color: #dc2626; color: #dc2626; background: color-mix(in srgb, #dc2626 6%, var(--ofin-sup)); }
.ofin-btn.perigo:hover:not(:disabled) { background: color-mix(in srgb, #dc2626 13%, var(--ofin-sup)); }
.ofin-btn.aviso { border-color: #d97706; color: #b45309; background: color-mix(in srgb, #d97706 7%, var(--ofin-sup)); }
.ofin-btn.aviso:hover:not(:disabled) { background: color-mix(in srgb, #d97706 14%, var(--ofin-sup)); }
.ofin-btn.mini { height: 28px; padding: 0 10px; font-size: 12px; border-radius: 8px; }
.ofin-link { border: none; background: transparent; padding: 0; color: ${TEAL}; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; }
.ofin-link:hover { color: ${TEAL_ESC}; text-decoration: underline; }
.ofin-x { border: none; background: transparent; color: #a3b1bd; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px; }
.ofin-x:hover:not(:disabled) { color: #dc2626; }

.ofin-pilulas { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; min-height: 38px; }
.ofin-pilula { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--ofin-borda); background: var(--ofin-sup);
  color: #5b6b7b; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.ofin-pilula:hover { border-color: ${TEAL}; color: ${TEAL_ESC}; }
.ofin-pilula.ativo { border-color: ${TEAL}; background: ${TEAL}; color: #fefefe; }
.ofin-pilula .n { font-size: 11px; padding: 0 7px; border-radius: 999px; background: var(--ofin-cinza); color: #6b7a89; }
.ofin-pilula.ativo .n { background: rgba(255,255,255,.25); color: #fefefe; }

.ofin-abas { display: flex; border-bottom: 1px solid var(--ofin-borda); margin-bottom: 14px; overflow-x: auto; }
.ofin-aba { padding: 9px 16px; font-size: 13px; white-space: nowrap; cursor: pointer; font-family: inherit; color: var(--portal-text, #1f2d3d); background: transparent;
  border: 1px solid transparent; border-top: 2px solid transparent; border-bottom: none; margin-bottom: -1px; border-radius: 4px 4px 0 0; }
.ofin-aba:hover { color: ${TEAL_ESC}; }
.ofin-aba.ativo { border-color: var(--ofin-borda); border-top: 2px solid ${TEAL}; background: var(--ofin-cinza); font-weight: 600; color: ${TEAL_ESC}; }

.ofin-grade-caixa { overflow: auto; border-radius: 12px; }
table.ofin-grade { width: 100%; border-collapse: collapse; }
.ofin-grade th { padding: 10px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #64748b; text-align: left; white-space: nowrap;
  background: var(--ofin-cinza); border-bottom: 1px solid var(--ofin-borda); }
.ofin-grade.fixo thead th { position: sticky; top: 0; z-index: 1; }
.ofin-grade.fixo thead tr + tr th { top: 37px; }
.ofin-grade th.ordena { cursor: pointer; user-select: none; }
.ofin-grade th.ordena:hover, .ofin-grade th.ativa { color: ${TEAL_ESC}; }
.ofin-grade th.filtro { padding: 4px 6px 6px; }
.ofin-grade th.num, .ofin-grade td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ofin-grade th.centro, .ofin-grade td.centro { text-align: center; }
.ofin-grade td { padding: 9px 12px; font-size: 13px; border-top: 1px solid var(--ofin-borda); vertical-align: middle; }
.ofin-grade tbody tr:first-child td { border-top: none; }
.ofin-grade tbody tr { transition: background .12s; }
.ofin-grade tbody tr:hover { background: color-mix(in srgb, ${TEAL} 5%, transparent); }
.ofin-grade tbody tr.sel { background: color-mix(in srgb, ${TEAL} 14%, transparent); }
.ofin-grade tbody tr.clica { cursor: pointer; }
.ofin-grade td.apagado { color: #6b7a89; font-size: 12px; }
.ofin-grade td.nowrap { white-space: nowrap; }
.ofin-grade td.vazio { text-align: center; color: #94a3b8; padding: 36px 12px; }
.ofin-grade tfoot td { font-weight: 700; background: var(--ofin-cinza); border-top: 1px solid var(--ofin-borda); }
.ofin-grade.compacta th { padding: 7px 10px; }
.ofin-grade.compacta td { padding: 6px 10px; font-size: 12.5px; }
.ofin-filtro-col { width: 100%; min-width: 80px; height: 28px; box-sizing: border-box; margin: 0; border: 1px solid var(--ofin-borda); border-radius: 7px; padding: 0 8px;
  font-size: 12px; font-weight: 400; text-transform: none; letter-spacing: 0; background: var(--ofin-sup); color: inherit; font-family: inherit; }
.ofin-filtro-col:focus { outline: none; border-color: ${TEAL}; }
.ofin-grade-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--ofin-borda); }
.ofin-grade-cab h2 { margin: 0; font-size: 15px; font-weight: 600; color: ${TEAL_ESC}; }
.ofin-grade-cab .ofin-sub { font-size: 12px; color: #6b7a89; }
.ofin-rodape { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 9px 12px; font-size: 11.5px; color: #6b7a89;
  border-top: 1px solid var(--ofin-borda); background: var(--ofin-cinza); border-radius: 0 0 12px 12px; }

.ofin-chip { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: 1.35; }
.ofin-chip.verde { background: #dcfce7; color: #15803d; }
.ofin-chip.vermelho { background: #fee2e2; color: #b91c1c; }
.ofin-chip.ambar { background: #fef3c7; color: #b45309; }
.ofin-chip.azul { background: #e0f2fe; color: #0369a1; }
.ofin-chip.roxo { background: #ede9fe; color: #6d28d9; }
.ofin-chip.cinza { background: #f1f5f9; color: #475569; }
.ofin-chip.teal { background: color-mix(in srgb, ${TEAL} 12%, transparent); color: ${TEAL_ESC}; }

.ofin-aviso { display: flex; gap: 10px; align-items: flex-start; border-radius: 8px; padding: 12px 16px; font-size: 13px; line-height: 1.5; background: #FFF6D6; color: #37474F; }
.ofin-aviso::before { content: "!"; flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: #EF5350; color: #fefefe; font-weight: 800; font-size: 13px; margin-top: 1px; }
.ofin-aviso.info { background: color-mix(in srgb, ${TEAL} 8%, var(--ofin-sup)); color: #24434b; }
.ofin-aviso.info::before { content: "i"; background: ${TEAL}; font-style: italic; font-family: Georgia, serif; }
.ofin-aviso.erro { background: #fef2f2; color: #b91c1c; }
[data-theme="dark"] .ofin-aviso { background: #3d3517; color: #fde68a; }
[data-theme="dark"] .ofin-aviso.info { background: color-mix(in srgb, ${TEAL} 18%, var(--ofin-sup)); color: #99f6e4; }
[data-theme="dark"] .ofin-aviso.erro { background: #3f1d1d; color: #fecaca; }

.ofin-msg { font-size: 12.5px; color: #6b7a89; }
.ofin-msg.ok { color: #047857; font-weight: 600; }
.ofin-msg.erro { color: #dc2626; }

.ofin-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: 12px; margin-bottom: 14px; }
.ofin-kpi { background: var(--ofin-sup); border: 1px solid var(--ofin-borda); border-radius: 12px; padding: 12px 16px; }
.ofin-kpi.destaque { border-color: ${TEAL}; box-shadow: 0 0 0 3px rgba(15,139,141,.08); }
.ofin-kpi > span { display: block; font-size: 11.5px; font-weight: 600; color: #6b7a89; }
.ofin-kpi > b { display: block; font-size: 20px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
.ofin-kpi > small { display: block; font-size: 11.5px; color: #94a3b8; margin-top: 2px; }

.ofin-caixa { border: 1px solid var(--ofin-borda); border-radius: 10px; padding: 14px 16px; }
.ofin-secao { margin: 0 0 10px; font-size: 14.5px; font-weight: 600; color: ${TEAL_ESC}; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ofin-secao small { font-size: 12px; font-weight: 400; color: #6b7a89; }
.ofin-resumo { font-size: 12px; color: #6b7a89; }
.ofin-resumo b { color: var(--portal-text, #1f2d3d); }

.ofin-overlay { position: fixed; inset: 0; z-index: 100010; background: rgba(15,23,42,.45); display: flex; align-items: center; justify-content: center; padding: 16px; }
.ofin-janela { background: var(--portal-bg-card, #fefefe); border-radius: 10px; width: 100%; max-height: 92vh; display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 24px 60px rgba(15,23,42,.3); font-size: 13px; color: var(--portal-text, #1f2d3d); }
.ofin-janela-topo { display: flex; align-items: center; gap: 12px; padding: 14px 22px; background: var(--portal-bg-secondary, #f3f5f6); }
.ofin-janela-topo .t { flex: 1; min-width: 0; }
.ofin-janela-topo .t b { display: block; font-size: 18px; font-weight: 600; color: ${TEAL_ESC}; }
.ofin-janela-topo .t small { display: block; font-size: 12px; color: #6b7a89; margin-top: 2px; }
.ofin-fechar { border: none; background: transparent; color: ${TEAL_ESC}; cursor: pointer; font-size: 14px; font-family: inherit; white-space: nowrap; }
.ofin-fechar:disabled { opacity: .4; cursor: not-allowed; }
.ofin-janela-corpo { padding: 20px 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
.ofin-janela-pe { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 12px 22px; border-top: 1px solid var(--portal-border, #d7dee3); }
.ofin-janela-pe .ofin-msg { margin-right: auto; }
.ofin-grid { display: grid; gap: 14px; }

.ofin-barra { display: grid; grid-template-columns: minmax(140px, 260px) 1fr 150px; align-items: center; gap: 12px; width: 100%; padding: 6px 8px; border: none; border-radius: 8px;
  background: transparent; cursor: pointer; text-align: left; font-family: inherit; color: inherit; }
.ofin-barra:hover { background: color-mix(in srgb, ${TEAL} 5%, transparent); }
.ofin-barra.ativo { background: color-mix(in srgb, ${TEAL} 13%, transparent); }
.ofin-barra .trilho { height: 16px; border-radius: 999px; background: var(--ofin-cinza); position: relative; overflow: hidden; }
.ofin-barra .trilho > i { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: linear-gradient(90deg, ${TEAL}, #34b3b5); transition: width .5s ease; }

@media (max-width: 720px) {
  .ofin-topo h1 { font-size: 17px; }
  .ofin-janela-corpo { padding: 16px; }
  .ofin-janela-topo, .ofin-janela-pe { padding: 12px 16px; }
  .ofin-janela-topo .t b { font-size: 16px; }
  .ofin-barra { grid-template-columns: 1fr 110px; }
  .ofin-barra .trilho { grid-column: 1 / -1; grid-row: 2; }
  .ofin-grid { grid-template-columns: 1fr !important; }
  .ofin-grid > * { grid-column: auto !important; }
  .ofin-filtros > div[style*="margin-left"] { margin-left: 0 !important; width: 100%; }
  .ofin-filtros > div[style*="margin-left"] .ofin-btn { width: 100%; }
  /* janela em tela cheia no celular */
  .ofin-overlay { padding: 0; align-items: stretch; }
  .ofin-janela { max-width: none !important; max-height: none; height: 100%; border-radius: 0; }
  .ofin-janela-pe .ofin-btn { flex: 1 1 auto; }
}
/* celular e tablet: alvo de toque de pelo menos 40 px (docs/padrao-telas.md §5); botões juntos quebram linha */
@media (max-width: 900px) {
  .ofin-btn, .ofin-btn.mini, .ofin-pilula, .ofin-inp, .ofin-filtro-col, .ofin-leitura { min-height: 40px; height: auto; }
  .ofin-seg { height: auto; min-height: 40px; flex-wrap: wrap; max-width: 100%; }
  .ofin-seg button { min-height: 40px; flex: 1 1 auto; }
  .ofin-aba { min-height: 40px; }
  .ofin-link, .ofin-fechar, .ofin-x { min-height: 40px; display: inline-flex; align-items: center; }
  .ofin-pilula { white-space: normal; }
  .ofin-barra { min-height: 40px; }
}
@media (prefers-reduced-motion: reduce) { .ofin-barra .trilho > i { transition: none; } }
`;

export function EstilosFin() { return <style>{CSS}</style>; }

/** Casca da página: título no padrão Omie, área à direita e "Como ler esta tela". */
export function PaginaFin({ titulo, sub, direita, comoLer, children }: { titulo: string; sub?: ReactNode; direita?: ReactNode; comoLer?: ReactNode; children: ReactNode }) {
  return (
    <div className="ofin est-page">
      <EstilosFin />
      <div className="ofin-topo">
        <div>
          <h1>{titulo}</h1>
          {sub && <div className="ofin-sub">{sub}</div>}
        </div>
        {direita && <div className="ofin-direita">{direita}</div>}
      </div>
      {comoLer && (
        <details className="ofin-comoler">
          <summary><i className="fas fa-circle-question" /> Como ler esta tela</summary>
          <div>{comoLer}</div>
        </details>
      )}
      {children}
    </div>
  );
}

/** Rótulo em cima da caixa, como no Omie. */
export function CampoFin({ titulo, children, apagado, style }: { titulo: ReactNode; children: ReactNode; apagado?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ minWidth: 0, ...style }}>
      <label className={`ofin-lbl${apagado ? ' apagado' : ''}`}>{titulo}</label>
      {children}
    </div>
  );
}

/** Botões juntos (A pagar | A receber). */
export function Segmentado<V extends string>({ valor, opcoes, onChange }: { valor: V; opcoes: [V, string][]; onChange: (v: V) => void }) {
  return (
    <div className="ofin-seg" role="group">
      {opcoes.map(([v, r]) => <button key={v} type="button" className={valor === v ? 'ativo' : ''} aria-pressed={valor === v} onClick={() => onChange(v)}>{r}</button>)}
    </div>
  );
}

type Variante = 'prim' | 'contorno' | 'neutro' | 'perigo' | 'aviso';
export function BotaoFin({ variante = 'contorno', mini, icone, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; mini?: boolean; icone?: string }) {
  const cls = ['ofin-btn', variante !== 'contorno' ? variante : '', mini ? 'mini' : '', className || ''].filter(Boolean).join(' ');
  return <button type="button" className={cls} {...rest}>{icone && <i className={`fas ${icone}`} />}{children}</button>;
}

export type CorChip = 'verde' | 'vermelho' | 'ambar' | 'azul' | 'roxo' | 'cinza' | 'teal';
export function Chip({ cor = 'cinza', children, title }: { cor?: CorChip; children: ReactNode; title?: string }) {
  return <span className={`ofin-chip ${cor}`} title={title}>{children}</span>;
}

/** Situação do título da Omie em selo. */
export function ChipSituacao({ s }: { s?: string | null }) {
  const cor: Record<string, CorChip> = { 'ATRASADO': 'vermelho', 'VENCE HOJE': 'ambar', 'A VENCER': 'azul', 'PAGO': 'verde', 'RECEBIDO': 'verde', 'LIQUIDADO': 'verde', 'CANCELADO': 'cinza' };
  return <Chip cor={cor[String(s || '').toUpperCase()] || 'cinza'}>{s || '—'}</Chip>;
}

export function ChipEmpresa({ conta }: { conta: string }) {
  return <Chip cor={String(conta).toUpperCase() === 'CASTRO' ? 'roxo' : 'teal'}>{String(conta).toUpperCase()}</Chip>;
}

/** "1 - N de N registros" + dica à direita. */
export function RodapeGrade({ mostrando, total, dica }: { mostrando: number; total?: number; dica?: ReactNode }) {
  const t = total ?? mostrando;
  return (
    <div className="ofin-rodape">
      <span>{mostrando ? `1 - ${mostrando} de ${t} ${t === 1 ? 'registro' : 'registros'}` : `0 de ${t} registros`}</span>
      {dica && <span>{dica}</span>}
    </div>
  );
}

/** Janela no formato "Item da Ordem de Serviço" do Omie. */
export function JanelaFin({ titulo, sub, largura = 640, onFechar, travado, pe, children }: {
  titulo: ReactNode; sub?: ReactNode; largura?: number; onFechar: () => void; travado?: boolean; pe?: ReactNode; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !travado) onFechar(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar, travado]);
  return (
    <div className="ofin-overlay" onClick={() => { if (!travado) onFechar(); }}>
      <EstilosFin />
      <div className="ofin-janela" role="dialog" aria-modal="true" style={{ maxWidth: largura }} onClick={(e) => e.stopPropagation()}>
        <div className="ofin-janela-topo">
          <div className="t"><b>{titulo}</b>{sub && <small>{sub}</small>}</div>
          <button type="button" className="ofin-fechar" onClick={onFechar} disabled={travado}>Fechar ✕</button>
        </div>
        <div className="ofin-janela-corpo">{children}</div>
        {pe && <div className="ofin-janela-pe">{pe}</div>}
      </div>
    </div>
  );
}

/** Cabeçalho ordenável da grade (A→Z / Z→A). */
export function ThOrdena({ rotulo, ativo, dir, onClick, num }: { rotulo: string; ativo: boolean; dir: number; onClick: () => void; num?: boolean }) {
  return (
    <th className={`ordena${ativo ? ' ativa' : ''}${num ? ' num' : ''}`} onClick={onClick}
      title={ativo ? (dir > 0 ? 'A→Z — clique para inverter' : 'Z→A — clique para inverter') : 'Clique para ordenar A→Z / Z→A'}
      aria-sort={ativo ? (dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {rotulo}{ativo ? (dir > 0 ? ' ▲' : ' ▼') : <span style={{ opacity: 0.35 }}> ⇅</span>}
    </th>
  );
}
