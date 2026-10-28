// CSS das 3 opções da página de teste do CRM/RFM (/feedbacks/crm/teste). Vive DENTRO de .fbn
// (estiloNovo.ts) e usa os mesmos tokens (--s, --b, --soft, --t, --t2, --t3, --c).
// Estilo POS NewPortal: cantos 16, peso máx. 500, sem caixa alta, sem faixa colorida do lado.
export const ESTILO_FILA = `
.fbf-topo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.fbf-seg { display: inline-flex; padding: 3px; border: 1px solid var(--b); border-radius: 12px; background: var(--s); gap: 2px }
.fbf-seg button { height: 34px; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; color: var(--t2); font: inherit; font-size: 13.5px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px }
.fbf-seg button.on { background: color-mix(in srgb, var(--k, var(--c)) 11%, var(--s)); color: var(--t) }
.fbf-seg button i { color: var(--k, var(--c)) }
.fbf-gravar { display: inline-flex; align-items: center; gap: 9px; height: 40px; padding: 0 12px; border-radius: 11px; border: 1px solid var(--b); background: var(--s); font-size: 13.5px; cursor: pointer; color: var(--t) }
.fbf-gravar .sw { width: 34px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--t3) 40%, var(--s)); position: relative; transition: background .2s; flex: none }
.fbf-gravar .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fefefe; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.25) }
.fbf-gravar.on { border-color: color-mix(in srgb, #dc2626 45%, var(--b)); background: color-mix(in srgb, #dc2626 7%, var(--s)) }
.fbf-gravar.on .sw { background: #dc2626 } .fbf-gravar.on .sw::after { transform: translateX(14px) }
.fbf-confirma { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 14px; border-radius: 12px; font-size: 13.5px;
  background: color-mix(in srgb, #dc2626 7%, var(--s)); border: 1px solid color-mix(in srgb, #dc2626 30%, transparent) }
.fbf-explica { font-size: 13.5px; color: var(--t2); line-height: 1.5; margin: 0 }
.fbf-explica b { color: var(--t) }
/* só o ícone e o texto (José, 28/10/2026); a explicação abre num quadro embaixo */
.fbf-como { font-size: 13.5px; color: var(--t2); padding: 8px 2px }
.fbf-como summary { cursor: pointer; color: var(--t); display: inline-flex; align-items: center; gap: 8px; list-style: none }
.fbf-como summary::-webkit-details-marker { display: none }
.fbf-como summary:hover { text-decoration: underline; text-underline-offset: 3px }
.fbf-como ul { margin: 8px 0 2px; padding: 10px 14px 10px 32px; line-height: 1.6; background: var(--s); border: 1px solid var(--b); border-radius: 14px }

/* barra de filtros comum */
.fbf-filtros { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.fbf-filtros .fbn-busca { flex: 1 1 280px }
.fbf-filtros select.fbn-campo { width: auto; min-width: 180px; height: 40px; border-radius: 12px }

/* ficha do cliente */
.fbf-ficha { display: grid; gap: 14px; min-width: 0 }
.fbf-nome { font-size: 20px; font-weight: 500; letter-spacing: -.01em; margin: 0; line-height: 1.25; overflow-wrap: anywhere }
.fbf-ficha.grande .fbf-nome { font-size: 22px }
.fbf-tel { display: inline-flex; align-items: center; gap: 8px; font-size: 18px; color: var(--t); text-decoration: none; font-variant-numeric: tabular-nums;
  padding: 6px 12px; border-radius: 11px; border: 1px solid color-mix(in srgb, #16a34a 30%, var(--b)); background: color-mix(in srgb, #16a34a 6%, var(--s)) }
.fbf-tel i { color: #16a34a; font-size: 15px }
.fbf-tel:hover { border-color: #16a34a }
.fbf-ficha.grande .fbf-tel { font-size: 22px; padding: 8px 14px }
.fbf-sem-tel { font-size: 14px; color: var(--t3) }
.fbf-faca { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 14px;
  background: color-mix(in srgb, var(--k) 7%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 25%, transparent) }
.fbf-faca .t { font-size: 16px; font-weight: 500; color: var(--t) }
.fbf-faca .p { font-size: 13.5px; color: var(--t2); margin-top: 2px; line-height: 1.45 }
.fbf-faca .fbn-ico { color: var(--k); background: color-mix(in srgb, var(--k) 12%, var(--s)); border-color: color-mix(in srgb, var(--k) 25%, transparent) }
.fbf-faca > div { min-width: 0 }
.fbf-sub { font-size: 12.5px; color: var(--t2); margin: 0 0 6px }
.fbf-tent { display: grid; gap: 4px; font-size: 13px; color: var(--t2) }
.fbf-tent div { display: flex; gap: 8px; align-items: center }
.fbf-tent i { width: 14px; text-align: center; color: var(--t3) }

/* ações */
.fbf-acoes { display: flex; gap: 8px; flex-wrap: wrap }
.fbf-acoes.grande .fbn-acao { height: 46px; padding: 0 16px; font-size: 14.5px; border-radius: 12px }
.fbf-acoes .fbn-acao[disabled] { opacity: .5; cursor: default }
.fbf-acoes .fbn-acao.on { background: color-mix(in srgb, var(--c) 9%, var(--s)); border-color: color-mix(in srgb, var(--c) 45%, transparent) }
.fbn-acao.wpp i { color: #16a34a } .fbn-acao.ambar i { color: #d97706 } .fbn-acao.azul i { color: #2563eb }
.fbf-painel { display: grid; gap: 12px; padding: 14px; border-radius: 14px; background: var(--soft); border: 1px solid var(--b) }
.fbf-painel .rot { font-size: 13px; color: var(--t2); margin-bottom: 6px }
.fbf-opcoes { display: flex; gap: 6px; flex-wrap: wrap }
.fbf-op { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border-radius: 10px; cursor: pointer; font: inherit; font-size: 13.5px;
  border: 1px solid var(--b); background: var(--s); color: var(--t) }
.fbf-op i { color: var(--k, var(--t3)) }
.fbf-op.on { background: color-mix(in srgb, var(--k, var(--c)) 12%, var(--s)); border-color: color-mix(in srgb, var(--k, var(--c)) 50%, transparent) }
.fbf-op.nota { width: 38px; padding: 0; justify-content: center; font-variant-numeric: tabular-nums }
.fbf-painel textarea, .fbf-painel input[type=text], .fbf-painel input[type=date] { width: 100%; box-sizing: border-box; border: 1px solid var(--b); border-radius: 10px; background: var(--s);
  color: var(--t); font: inherit; font-size: 14px; padding: 9px 11px; outline: 0 }
.fbf-painel textarea { min-height: 70px; resize: vertical }
.fbf-painel input[type=date] { width: auto; height: 38px; padding: 0 10px }
.fbf-alerta { font-size: 13px; color: #b91c1c; display: flex; gap: 7px; align-items: center }

/* opção 1 */
.fbf-o1 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 14px; align-items: start }
.fbf-o1-card { padding: 20px 22px 18px; gap: 16px }
.fbf-o1-nav { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: space-between }
.fbf-falta { font-size: 13.5px; color: var(--t2); display: flex; align-items: center; gap: 8px }
.fbf-falta b { color: var(--t); font-variant-numeric: tabular-nums }
.fbf-prox { display: grid; gap: 8px; position: sticky; top: 90px }
.fbf-prox h3 { font-size: 14px; font-weight: 500; margin: 0; color: var(--t2) }
.fbf-mini { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border: 1px solid var(--b); border-radius: 14px; background: var(--s); cursor: pointer; text-align: left;
  font: inherit; color: var(--t); width: 100%; transition: border-color .2s, transform .2s }
.fbf-mini:hover { border-color: color-mix(in srgb, var(--c) 35%, var(--b)); transform: translateY(-1px) }
.fbf-mini .n { width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; font-size: 12px; background: var(--soft); color: var(--t2); flex: none; font-variant-numeric: tabular-nums }
.fbf-mini .x { min-width: 0; flex: 1 }
.fbf-mini .x div { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbf-mini .x small { font-size: 12px; color: var(--t2) }

/* opção 2 */
.fbf-quadro { display: grid; grid-template-columns: repeat(4, minmax(240px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 6px }
.fbf-col { background: var(--soft); border: 1px solid var(--b); border-radius: 16px; padding: 10px; display: grid; gap: 8px; align-content: start; min-height: 200px }
.fbf-col-cab { display: flex; align-items: center; gap: 8px; padding: 2px 4px 4px; font-size: 14.5px }
.fbf-col-cab .fbn-ico { --c: var(--k) }
.fbf-col-cab .n { margin-left: auto; font-size: 12.5px; padding: 1px 9px; border-radius: 999px; background: color-mix(in srgb, var(--k) 12%, var(--s)); font-variant-numeric: tabular-nums }
.fbf-cartao { background: var(--s); border: 1px solid var(--b); border-radius: 14px; padding: 11px 12px; display: grid; gap: 7px; cursor: pointer; text-align: left; font: inherit; color: var(--t);
  transition: transform .2s, box-shadow .2s, border-color .2s }
.fbf-cartao:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c) 35%, var(--b)) }
.fbf-cartao.sel { border-color: var(--c) }
.fbf-cartao .nm { font-size: 14.5px; font-weight: 500; overflow-wrap: anywhere }
.fbf-cartao .lin { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--t2) }
.fbf-mais { font-size: 12.5px; color: var(--t2); text-align: center; padding: 4px }
.fbf-gaveta-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.35); z-index: 9000; animation: fbfFade .2s }
.fbf-gaveta { position: fixed; top: 0; right: 0; bottom: 0; width: min(520px, 100vw); background: var(--portal-bg, #f8fafc); z-index: 9001; overflow-y: auto;
  box-shadow: -18px 0 40px -24px rgba(15,23,42,.6); padding: 16px; display: grid; gap: 12px; align-content: start; animation: fbfEntra .25s }
.fbf-gaveta-cab { display: flex; align-items: center; justify-content: space-between; gap: 8px }
@keyframes fbfEntra { from { transform: translateX(30px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes fbfFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes fbfSobe { from { transform: translateY(40px); opacity: 0 } to { transform: none; opacity: 1 } }

/* opção 3 */
.fbf-o3 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 440px); gap: 14px; align-items: start }
.fbf-tabela-caixa { background: var(--s); border: 1px solid var(--b); border-radius: 16px; overflow: auto; max-width: 100% }
.fbf-tabela { width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 720px }
.fbf-tabela th { text-align: left; font-weight: 400; font-size: 12.5px; color: var(--t2); background: var(--soft); padding: 9px 12px; border-bottom: 1px solid var(--b); white-space: nowrap; cursor: pointer; user-select: none; position: sticky; top: 0 }
.fbf-tabela th i { margin-left: 5px; font-size: 10.5px; color: var(--t3) }
.fbf-tabela th.on { color: var(--t) } .fbf-tabela th.on i { color: var(--c) }
.fbf-tabela td { padding: 9px 12px; border-bottom: 1px solid var(--b); vertical-align: middle }
.fbf-tabela tr { cursor: pointer; transition: background .15s }
.fbf-tabela tbody tr:hover { background: color-mix(in srgb, #0369a1 4%, transparent) }
.fbf-tabela tbody tr.sel { background: color-mix(in srgb, var(--c) 7%, transparent) }
.fbf-tabela .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
.fbf-tabela .cli { font-weight: 500 } .fbf-tabela .cli small { display: block; font-weight: 400; font-size: 12px; color: var(--t2) }
.fbf-lado { position: sticky; top: 90px; max-height: calc(100vh - 110px); overflow-y: auto }
.fbf-lado-vazio { padding: 40px 20px; text-align: center; color: var(--t2); font-size: 14px; background: var(--s); border: 1px dashed var(--b); border-radius: 16px }
.fbf-fechar-lado { display: none }

/* aviso (toast) */
.fbf-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 9100; max-width: min(560px, calc(100vw - 32px));
  padding: 11px 16px; border-radius: 12px; font-size: 14px; display: flex; gap: 10px; align-items: center; box-shadow: 0 16px 32px -18px rgba(15,23,42,.7); animation: fbfSobe .25s;
  background: #111111; color: #fefefe }
.fbf-toast.sim i { color: #fbbf24 } .fbf-toast.ok i { color: #4ade80 } .fbf-toast.erro { background: #7f1d1d }
.fbf-toast button { background: transparent; border: 0; color: #fefefe; cursor: pointer; opacity: .7 }

/* aba Revisões do RFM (ficha do trator, gráfico, quadro de 5 colunas) */
.fbf-abas { display: flex; gap: 2px; border-bottom: 1px solid var(--b); overflow-x: auto }
.fbf-abas button { padding: 8px 14px; border: 0; border-radius: 10px 10px 0 0; background: transparent; color: var(--t2); font: inherit; font-size: 13.5px; cursor: pointer; white-space: nowrap; display: inline-flex; gap: 7px; align-items: center }
.fbf-abas button i { color: var(--t3) }
.fbf-abas button.on { background: var(--s); color: var(--t); box-shadow: 0 -1px 0 var(--b) inset, 1px 0 0 var(--b), -1px 0 0 var(--b) }
.fbf-abas button.on i { color: var(--c) }
.fbf-aviso { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 12px; font-size: 13.5px; line-height: 1.45;
  background: color-mix(in srgb, #d97706 8%, var(--s)); border: 1px solid color-mix(in srgb, #d97706 30%, transparent) }
.fbf-aviso i { color: #d97706; margin-top: 2px }
.fbr-prev { min-width: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
.fbr-prev > div { border: 1px solid var(--b); border-radius: 14px; padding: 10px 12px; display: grid; gap: 2px; background: var(--s); min-width: 0 }
.fbr-prev small { font-size: 12px; color: var(--t2) }
.fbr-prev b { font-weight: 500; font-size: 18px; font-variant-numeric: tabular-nums }
.fbr-prev span { font-size: 12.5px; color: var(--t2) }
.fbr-expl { margin: -4px 0 0; font-size: 13px; color: var(--t2); line-height: 1.45 }
.fbr-linha { display: grid; gap: 4px; font-size: 13px }
.fbr-linha > div { display: grid; grid-template-columns: 14px 84px 70px minmax(0, 1fr); gap: 8px; align-items: baseline }
.fbr-linha i { font-size: 9px; color: var(--c) } .fbr-linha .fora i { color: #dc2626; font-size: 11px }
.fbr-linha .d, .fbr-linha .h { font-variant-numeric: tabular-nums; white-space: nowrap } .fbr-linha .h { text-align: right }
.fbr-linha .f { color: var(--t2); overflow-wrap: anywhere } .fbr-linha .fora .d, .fbr-linha .fora .h { color: var(--t3); text-decoration: line-through }
.fbr-quadro { grid-template-columns: repeat(5, minmax(230px, 1fr)) }
@media (max-width: 640px) {
  .fbr-prev { grid-template-columns: repeat(2, minmax(0, 1fr)) }
  .fbr-quadro { grid-template-columns: repeat(5, minmax(78vw, 1fr)) }
  .fbr-linha > div { grid-template-columns: 14px 78px 62px } .fbr-linha .f { grid-column: 2 / -1 }
}

@media (max-width: 1100px) {
  .fbf-o1 { grid-template-columns: minmax(0, 1fr) }
  .fbf-prox { position: static }
}
@media (max-width: 960px) {
  .fbf-o3 { grid-template-columns: minmax(0, 1fr) }
  .fbf-lado { position: fixed; left: 0; right: 0; bottom: 0; top: auto; max-height: 82vh; z-index: 9001; border-radius: 18px 18px 0 0;
    background: var(--portal-bg, #f8fafc); padding: 12px; box-shadow: 0 -18px 40px -20px rgba(15,23,42,.6); animation: fbfSobe .25s }
  .fbf-lado.vazio { display: none }
  .fbf-fechar-lado { display: flex; justify-content: center; margin-bottom: 6px }
}
@media (max-width: 640px) {
  .fbf-quadro { grid-template-columns: repeat(4, minmax(78vw, 1fr)); scroll-snap-type: x mandatory }
  .fbf-col { scroll-snap-align: start }
  .fbf-o1-card { padding: 16px 14px }
  .fbf-acoes.grande .fbn-acao { flex: 1 1 calc(50% - 8px); justify-content: center }
  .fbf-filtros select.fbn-campo { flex: 1 1 100% }
}
@media (prefers-reduced-motion: reduce) {
  .fbf-gaveta, .fbf-gaveta-fundo, .fbf-toast, .fbf-lado { animation: none }
  .fbf-cartao, .fbf-mini { transition: none }
}

/* Régua das horas até a revisão (28/10/2026) */
.fbr-regua { --rg: var(--c, #0f766e); --al: #d97706; min-width: 0; margin: 0; border: 1px solid var(--b); border-radius: 14px; padding: 14px 16px 10px; background: var(--s); display: grid; gap: 14px }
.fbr-regua.atrasada { --al: #dc2626 }
.fbr-rg-frase { display: flex; gap: 12px; align-items: center }
.fbr-rg-frase > i { flex: none; width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: var(--al); background: color-mix(in srgb, var(--al) 12%, var(--s)) }
.fbr-rg-frase > div { display: grid; gap: 2px; min-width: 0 }
.fbr-rg-frase b { font-size: 15.5px; font-weight: 500; color: var(--t) }
.fbr-regua.atrasada .fbr-rg-frase b { color: #b91c1c }
.fbr-rg-frase span { font-size: 12.5px; color: var(--t2) }
.fbr-rg-pista { position: relative; padding: 38px 4px 0 }
.fbr-rg-hoje { position: absolute; top: 0; transform: translateX(-50%); display: grid; justify-items: center; line-height: 1.1; white-space: nowrap; animation: rlEntra .4s both }
.fbr-rg-hoje small { font-size: 11px; color: var(--t2) }
.fbr-rg-hoje b { font-size: 13.5px; font-weight: 500; color: var(--t); font-variant-numeric: tabular-nums }
.fbr-rg-hoje::after { content: ""; width: 0; height: 0; border: 5px solid transparent; border-top-color: var(--t2); margin-top: 1px }
.fbr-rg-barra { position: relative; height: 12px; border-radius: 99px; background: var(--soft) }
.fbr-rg-barra .est, .fbr-rg-barra .lido { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; transition: width .6s ease }
.fbr-rg-barra .est { background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--rg) 45%, var(--s)) 0 5px, color-mix(in srgb, var(--rg) 22%, var(--s)) 5px 10px) }
.fbr-rg-barra .lido { background: var(--rg) }
.fbr-rg-barra .tick { position: absolute; top: -3px; bottom: -3px; width: 3px; margin-left: -1.5px; border-radius: 2px; background: var(--t); cursor: help }
.fbr-rg-barra .pino { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--s); border: 2px solid var(--b) }
.fbr-rg-barra .pino.feita, .fbr-rg-barra .pino.antes { border-color: #16a34a; background: #16a34a }
.fbr-rg-barra .pino.antes { opacity: .45 }
.fbr-rg-barra .pino.pulou { border-color: #94a3b8; background: #e2e8f0 }
.fbr-rg-barra .pino.alvo { width: 20px; height: 20px; margin: -10px 0 0 -10px; border: 3px solid var(--al); box-shadow: 0 0 0 4px color-mix(in srgb, var(--al) 18%, transparent) }
.fbr-rg-barra .pino.alvo.atrasada { background: var(--al) }
.fbr-rg-paradas { position: relative; height: 36px; margin-top: 8px }
.fbr-rg-paradas > span { position: absolute; top: 0; transform: translateX(-50%); display: grid; justify-items: center; line-height: 1.15; white-space: nowrap }
.fbr-rg-paradas > span.ini { transform: none; font-size: 11.5px; color: var(--t2) }
.fbr-rg-paradas b { font-size: 12.5px; font-weight: 400; color: var(--t2); font-variant-numeric: tabular-nums }
.fbr-rg-paradas small { font-size: 11px; color: var(--t2) }
.fbr-rg-paradas .alvo b { font-size: 14px; font-weight: 500; color: var(--al) }
.fbr-rg-paradas .alvo small { color: var(--al) }
.fbr-rg-paradas .feita small { color: #15803d }
.fbr-rg-paradas .pulou small { color: #64748b }
.fbr-rg-paradas > span:last-child:not(.alvo) { transform: translateX(-100%); justify-items: end }
.fbr-regua figcaption { display: flex; gap: 6px 16px; flex-wrap: wrap; font-size: 12px; color: var(--t2); border-top: 1px dashed var(--b); padding-top: 8px }
.fbr-regua figcaption span { display: inline-flex; gap: 6px; align-items: center }
.fbr-regua figcaption i { width: 18px; height: 8px; border-radius: 99px; display: inline-block }
.fbr-regua figcaption i.lido { background: var(--rg) }
.fbr-regua figcaption i.est { background: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--rg) 45%, var(--s)) 0 3px, color-mix(in srgb, var(--rg) 22%, var(--s)) 3px 6px) }
`;
