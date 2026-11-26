// CSS do módulo Remessas (prefixo .rm-). Variáveis do portal (claro/escuro);
// branco que o modo escuro não converte = #fefefe; preto = #111111.
export const ROXO = '#7c3aed';

export const CSS_RM = `
.rm-tela { --bg: var(--portal-bg-secondary); --surface: var(--portal-bg-card); --border: var(--portal-border-strong, #e5e5e5); --text: var(--portal-text); --text-light: var(--portal-text-secondary); color: var(--portal-text); min-width: 0; }
[data-theme="dark"] .rm-tela { --border: #333333; }
.rm-faixa { display: flex; align-items: flex-end; gap: 3px; padding: 10px clamp(12px, 2vw, 24px) 0; background: linear-gradient(135deg, #a78bfa, #5b21b6); overflow-x: auto; -webkit-overflow-scrolling: touch; box-shadow: 0 1px 4px var(--portal-shadow); }
.rm-guia { display: flex; align-items: center; gap: 7px; padding: 11px 16px; font-size: 14px; font-weight: 500; color: var(--mx-t, #111111); background: rgba(255,255,255,0.32); border: none; border-radius: 11px 11px 0 0; cursor: pointer; white-space: nowrap; font-family: inherit; min-height: 40px; }
.rm-guia.on { background: var(--mx-bg0, #fefefe); font-weight: 700; box-shadow: 0 -2px 6px rgba(0,0,0,0.15); }
.rm-guia .rm-n { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 999px; background: var(--mx-p-violet, #ede9fe); color: var(--mx-fg-violet, #5b21b6); }
.rm-guia .rm-n.alerta { background: var(--mx-p-red, #fee2e2); color: var(--mx-fg-red, #991b1b); }
[data-theme="dark"] .rm-guia { background: rgba(0,0,0,0.3); } [data-theme="dark"] .rm-guia.on { background: var(--portal-bg-card, #1a1a1a); } [data-theme="dark"] .rm-chip.on { border-color: rgb(167 139 250 / .5); }
.rm-faixa-dir { margin-left: auto; display: flex; gap: 8px; align-items: center; padding-bottom: 6px; padding-left: 8px; }
.rm-root { padding: clamp(12px, 2vw, 24px); display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.rm-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; min-width: 0; }
.rm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.rm-btn:disabled { opacity: .45; cursor: not-allowed; }
.rm-btn.pri { background: #7c3aed; border-color: #7c3aed; color: #fefefe; }
.rm-btn.ok { background: #16a34a; border-color: #16a34a; color: #fefefe; }
.rm-btn.azul { background: #0284c7; border-color: #0284c7; color: #fefefe; }
.rm-btn.perigo { color: var(--mx-fg-red, #dc2626); border-color: var(--mx-pb-red, #fecaca); }
.rm-btn.branco { background: var(--mx-bg0, #fefefe); color: var(--mx-t, #111111); border-color: var(--mx-bd, #fefefe); }
.rm-btn.peq { min-height: 34px; padding: 0 10px; font-size: 12.5px; }
.rm-input { width: 100%; min-height: 40px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 14px; font-family: inherit; box-sizing: border-box; }
.rm-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-light); }
.rm-campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.rm-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 12px; }
.rm-selo { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.rm-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.rm-chip { min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
.rm-chip.on { background: var(--mx-p-violet, #ede9fe); border-color: #a78bfa; color: var(--mx-fg-violet, #5b21b6); }
.rm-tabela-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
.rm-tabela { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.rm-tabela th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-light); background: var(--bg); padding: 8px 10px; white-space: nowrap; }
.rm-tabela th.ord { cursor: pointer; user-select: none; }
.rm-tabela .rm-filtros th { padding: 4px 6px 8px; text-transform: none; }
.rm-fcol { min-height: 32px; padding: 4px 8px; font-size: 12.5px; min-width: 80px; }
.rm-tabela td { padding: 8px 10px; border-top: 1px solid var(--border); vertical-align: middle; }
.rm-tabela tbody tr { cursor: pointer; }
.rm-tabela tbody tr:hover { background: var(--portal-bg-hover); }
.rm-aviso { font-size: 13px; border-radius: 8px; padding: 9px 12px; background: var(--mx-p-amber, #fffbeb); border: 1px solid var(--mx-pb-amber, #fde68a); color: var(--mx-fg-orange, #92400e); }
.rm-erro { font-size: 13px; border-radius: 8px; padding: 9px 12px; background: var(--mx-p-red, #fef2f2); border: 1px solid var(--mx-pb-red, #fecaca); color: var(--mx-fg-red, #991b1b); }
.rm-ok { font-size: 13px; border-radius: 8px; padding: 9px 12px; background: var(--mx-p-green, #f0fdf4); border: 1px solid var(--mx-pb-green, #bbf7d0); color: var(--mx-fg-green, #166534); }
.rm-demos { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 12px; }
.rm-demo { text-align: left; font-family: inherit; color: var(--text); cursor: pointer; display: flex; flex-direction: column; gap: 8px; border-left: 5px solid var(--cor, #7c3aed); }
.rm-barra { height: 8px; border-radius: 999px; background: var(--bg); overflow: hidden; }
.rm-barra > i { display: block; height: 100%; border-radius: 999px; }
.rm-modal-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.6); z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 16px; }
.rm-modal { width: min(980px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: var(--portal-bg, var(--bg)); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 14px; color: var(--text); }
.rm-tempo { display: flex; flex-direction: column; gap: 0; border-left: 2px solid var(--border); margin-left: 6px; }
.rm-tempo > div { position: relative; padding: 0 0 12px 16px; font-size: 13px; }
.rm-tempo > div::before { content: ''; position: absolute; left: -7px; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: var(--cor, #7c3aed); border: 2px solid var(--surface); }
.rm-lista-flutuante { position: absolute; top: 100%; left: 0; right: 0; z-index: 60; margin-top: 4px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--border); border-radius: 8px; max-height: 300px; overflow-y: auto; box-shadow: 0 10px 28px rgba(0,0,0,.22); }
.rm-lista-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; text-align: left; padding: 9px 12px; border: none; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer; font-family: inherit; font-size: 14px; min-height: 44px; }
.rm-lista-item:hover { background: var(--portal-bg-hover); }
.rm-sec { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--mx-fg-violet, #7c3aed); }
@media (max-width: 760px) {
  .rm-modal-fundo { padding: 0; }
  .rm-modal { width: 100%; max-height: 100dvh; height: 100dvh; border-radius: 0; }
  .rm-faixa-dir .rm-txt-longo { display: none; }
  .rm-so-pc { display: none; }
  .rm-chip, .rm-btn.peq, .rm-fcol { min-height: 40px; }
}
/* tema escuro: cores dos hex fixos acima (no claro valem os próprios hex) */
[data-theme="dark"] { --mx-bg0: var(--portal-bg-card, #1a1a1a); --mx-bg1: var(--portal-bg-secondary, #262626); --mx-bg2: #2e2e2e; --mx-bg3: #3a3a3a; --mx-bd: var(--portal-border, #2a2a2a); --mx-t: var(--portal-text, #f5f5f5); --mx-t2: var(--portal-text-secondary, #a3a3a3); --mx-t3: var(--portal-text-muted, #949494); --mx-fg-red: var(--portal-red-fg, #f87171); --mx-p-red: rgb(248 113 113 / .15); --mx-pb-red: rgb(248 113 113 / .35); --mx-fg-orange: #fb923c; --mx-p-orange: rgb(251 146 60 / .15); --mx-pb-orange: rgb(251 146 60 / .35); --mx-fg-amber: var(--portal-amber-fg, #fbbf24); --mx-p-amber: rgb(251 191 36 / .15); --mx-pb-amber: rgb(251 191 36 / .35); --mx-fg-green: var(--portal-green-fg, #34d399); --mx-p-green: rgb(52 211 153 / .15); --mx-pb-green: rgb(52 211 153 / .35); --mx-fg-teal: var(--portal-teal-fg, #2dd4bf); --mx-p-teal: rgb(45 212 191 / .15); --mx-pb-teal: rgb(45 212 191 / .35); --mx-fg-blue: var(--portal-blue-fg, #60a5fa); --mx-p-blue: rgb(96 165 250 / .15); --mx-pb-blue: rgb(96 165 250 / .35); --mx-fg-violet: var(--portal-violet-fg, #a78bfa); --mx-p-violet: rgb(167 139 250 / .15); --mx-pb-violet: rgb(167 139 250 / .35); --mx-fg-pink: var(--portal-pink-fg, #f472b6); --mx-p-pink: rgb(244 114 182 / .15); --mx-pb-pink: rgb(244 114 182 / .35); }

`;
