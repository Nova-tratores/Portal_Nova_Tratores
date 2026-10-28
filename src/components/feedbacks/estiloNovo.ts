// Visual "Estilo POS NewPortal" (docs/estilo-pos-newportal.md) no CRM e no RFM — José, 23/10/2026:
// "ele tá feio, tá ruim pra ver as coisas; aplica o novo visual". Escopo próprio (.fbn) para não
// mexer nas outras telas de Feedbacks, que ainda usam feedbacks.module.css.
// Cartões de cantos 16, sem negrito (máx. 500), sem caixa alta, sem faixa colorida, ícone em
// quadradinho, cores pelas variáveis do tema.
export const ESTILO_FBN = `
.fbn { --s: var(--portal-bg-card, #fefefe); --b: var(--portal-border, #e2e8f0); --soft: var(--portal-bg-secondary, #f8fafc);
  --t: var(--portal-text, #0f172a); --t2: var(--portal-text-secondary, #475569); --t3: var(--portal-text-muted, #94a3b8);
  font-family: Inter, system-ui, sans-serif; color: var(--t); padding-top: 18px; display: grid; gap: 14px }
.fbn *:not(i):not([class*="fa-"]) { font-weight: inherit }
.fbn b, .fbn strong { font-weight: 500 }

/* topo */
.fbn-topo { display: flex; align-items: center; gap: 12px; flex-wrap: wrap }
.fbn-titulo { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 500; letter-spacing: -.01em; margin: 0 }
.fbn-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; flex: none;
  color: var(--c, #dc2626); background: color-mix(in srgb, var(--c, #dc2626) 9%, var(--s)); border: 1px solid color-mix(in srgb, var(--c, #dc2626) 18%, transparent) }
.fbn-ico.p { width: 34px; height: 34px; border-radius: 10px; font-size: 14px }
.fbn-conta { font-size: 13px; color: var(--t2); padding: 3px 10px; border-radius: 999px; background: var(--soft); border: 1px solid var(--b); font-variant-numeric: tabular-nums }
.fbn-busca { flex: 1 1 320px; display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border: 1px solid var(--b); border-radius: 12px; background: var(--s) }
.fbn-busca i { color: var(--t3) }
.fbn-busca input { flex: 1; border: 0; outline: 0; background: transparent; font: inherit; font-size: 14px; color: var(--t); min-width: 0 }
.fbn-btn { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 14px; border-radius: 11px; cursor: pointer;
  font: inherit; font-size: 14px; border: 1px solid var(--b); background: var(--s); color: var(--t); white-space: nowrap }
.fbn-btn:hover { border-color: color-mix(in srgb, var(--c, #dc2626) 40%, var(--b)) }
.fbn-btn.cheio { background: var(--c, #dc2626); border-color: var(--c, #dc2626); color: #fefefe }
.fbn-btn.on { background: color-mix(in srgb, var(--c, #dc2626) 8%, var(--s)); border-color: color-mix(in srgb, var(--c, #dc2626) 40%, transparent) }

/* atalhos de situação (cada um com a sua cor e a contagem) */
.fbn-chips { display: flex; gap: 8px; flex-wrap: wrap }
.fbn-chip { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border-radius: 999px; cursor: pointer; font: inherit; font-size: 13.5px;
  border: 1px solid var(--b); background: var(--s); color: var(--t2) }
.fbn-chip i { color: var(--k) }
.fbn-chip .n { font-size: 12px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--k) 12%, var(--s)); color: var(--t); font-variant-numeric: tabular-nums }
.fbn-chip.on { color: var(--t); background: color-mix(in srgb, var(--k) 9%, var(--s)); border-color: color-mix(in srgb, var(--k) 45%, transparent) }

/* filtros */
.fbn-filtros { padding: 14px 16px; background: var(--s); border: 1px solid var(--b); border-radius: 16px;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; align-items: end }
.fbn-rot { font-size: 12.5px; color: var(--t2); margin-bottom: 4px }
.fbn-campo { width: 100%; height: 38px; padding: 0 10px; border: 1px solid var(--b); border-radius: 10px; font: inherit; font-size: 13.5px; background: var(--s); color: var(--t); outline: 0 }

/* grade de cartões */
.fbn-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 14px }
.fbn-vazio { padding: 56px 20px; text-align: center; color: var(--t2); font-size: 14px; background: var(--s); border: 1px dashed var(--b); border-radius: 16px }
.fbn-erro { padding: 10px 14px; background: #fef2f2; color: #991b1b; border-radius: 12px; font-size: 13.5px }

/* cartão do cliente */
.fbn-card { background: var(--s); border: 1px solid var(--b); border-radius: 16px; padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 12px;
  transition: box-shadow .25s, transform .25s, border-color .25s; min-width: 0 }
.fbn-card.clica { cursor: pointer }
.fbn-card.clica:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c) 35%, var(--b)) }
.fbn-card.atrasado { border-color: color-mix(in srgb, #dc2626 45%, var(--b)) }
.fbn-cab { display: flex; gap: 11px; align-items: flex-start }
.fbn-nome { font-size: 16.5px; font-weight: 500; line-height: 1.25; margin: 0; overflow-wrap: anywhere }
.fbn-contato { font-size: 13px; color: var(--t2); margin-top: 3px; display: flex; gap: 4px 10px; flex-wrap: wrap }
.fbn-contato a { color: var(--t2); text-decoration: none } .fbn-contato a:hover { color: var(--c) }
.fbn-pilula { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 2px 10px; border-radius: 999px; white-space: nowrap;
  color: color-mix(in srgb, var(--k, #64748b) 80%, #0f172a); background: color-mix(in srgb, var(--k, #64748b) 11%, var(--s)); border: 1px solid color-mix(in srgb, var(--k, #64748b) 22%, transparent) }
.fbn-selos { display: flex; gap: 6px; flex-wrap: wrap }
.fbn-atend { font-size: 13px; color: var(--t2); display: flex; gap: 7px; align-items: baseline } .fbn-atend > i { flex: none } .fbn-atend > span { min-width: 0 }
.fbn-atend b { color: var(--t) }
.fbn-dados { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px 14px }
.fbn-dados small { display: block; font-size: 12px; color: var(--t2) }
.fbn-dados span { font-size: 14px; color: var(--t); overflow-wrap: anywhere }
.fbn-os { font-size: 13px; color: var(--t2); display: flex; gap: 7px; align-items: baseline }
.fbn-os i { color: var(--t3) }
.fbn-texto { margin: 0; padding: 10px 12px; background: var(--soft); border-radius: 10px; font-size: 14px; line-height: 1.55; color: var(--t) }
.fbn-acoes { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--b) }
.fbn-acao { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 10px; cursor: pointer; font: inherit; font-size: 13.5px;
  border: 1px solid var(--b); background: var(--s); color: var(--t) }
.fbn-acao:hover { border-color: color-mix(in srgb, var(--c) 40%, var(--b)) }
.fbn-acao.cheio { background: var(--c); border-color: var(--c); color: #fefefe }
.fbn-acao.verde i { color: #16a34a } .fbn-acao.cinza i { color: var(--t3) }
.fbn-grupo { font-size: 12.5px; color: var(--t2); margin: 0 2px 0 4px; white-space: nowrap }
.fbn-sep { width: 1px; align-self: stretch; background: var(--b); margin: 4px 4px }
.fbn-explica { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.5; color: var(--t2); background: color-mix(in srgb, var(--c) 6%, var(--s)); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent) }
.fbn-explica b { color: var(--t); font-weight: 500 }
`;
