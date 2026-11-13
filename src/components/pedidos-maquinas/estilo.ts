// CSS do módulo Pedidos de Máquinas (prefixo .pm-). Usa as variáveis do portal
// (claro/escuro); branco que o modo escuro não converte = #fefefe; preto = #111111.
export const VERMELHO = '#dc2626';

export const CSS_PM = `
.pm-root { padding: clamp(12px, 2vw, 28px); display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.pm-faixa { display: flex; align-items: flex-end; gap: 3px; padding: 10px clamp(12px, 2vw, 24px) 0; background: linear-gradient(135deg, #f87171, #991b1b); overflow-x: auto; -webkit-overflow-scrolling: touch; box-shadow: 0 1px 4px var(--portal-shadow); }
.pm-guia { display: flex; align-items: center; gap: 7px; padding: 11px 18px; font-size: 14px; font-weight: 500; color: #111111; background: rgba(255,255,255,0.30); border: none; border-radius: 11px 11px 0 0; cursor: pointer; white-space: nowrap; font-family: inherit; min-height: 40px; }
.pm-guia.on { background: #fefefe; font-weight: 700; box-shadow: 0 -2px 6px rgba(0,0,0,0.15); }
.pm-faixa-dir { margin-left: auto; display: flex; gap: 8px; align-items: center; padding-bottom: 6px; }
.pm-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; min-width: 0; }
.pm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.pm-btn:disabled { opacity: .45; cursor: not-allowed; }
.pm-btn.pri { background: #dc2626; border-color: #dc2626; color: #fefefe; }
.pm-btn.ok { background: #16a34a; border-color: #16a34a; color: #fefefe; }
.pm-btn.azul { background: #0284c7; border-color: #0284c7; color: #fefefe; }
.pm-btn.perigo { color: #dc2626; border-color: #fecaca; }
.pm-btn.branco { background: #fefefe; color: #111111; border-color: #fefefe; }
.pm-input { width: 100%; min-height: 40px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font-size: 14px; font-family: inherit; box-sizing: border-box; }
.pm-lbl { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-light); }
.pm-campo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.pm-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px; }
.pm-selo { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.pm-tabela-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; }
.pm-tabela { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.pm-tabela th { text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-light); background: var(--bg); padding: 8px 10px; white-space: nowrap; }
.pm-tabela td { padding: 7px 10px; border-top: 1px solid var(--border); vertical-align: middle; }
.pm-aviso { font-size: 13px; border-radius: 8px; padding: 9px 12px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.pm-erro { font-size: 13px; border-radius: 8px; padding: 9px 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.pm-sec-tit { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #dc2626; display: flex; align-items: center; gap: 8px; }
.pm-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.55); z-index: 1000; display: flex; justify-content: flex-end; }
.pm-drawer { width: min(1100px, 100%); height: 100dvh; background: var(--portal-bg, var(--bg)); display: flex; flex-direction: column; box-shadow: -8px 0 30px rgba(0,0,0,.25); animation: pm-entra .2s ease-out; }
.pm-modal-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.6); z-index: 1100; display: flex; align-items: center; justify-content: center; padding: 16px; }
.pm-modal { width: min(820px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: var(--portal-bg, var(--bg)); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
@keyframes pm-entra { from { transform: translateX(30px); opacity: .4 } to { transform: none; opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .pm-drawer { animation: none } }
@media (max-width: 760px) {
  .pm-modal-fundo { padding: 0; }
  .pm-modal { width: 100%; max-height: 100dvh; height: 100dvh; border-radius: 0; }
  .pm-faixa-dir .pm-txt-longo { display: none; }
}
`;
