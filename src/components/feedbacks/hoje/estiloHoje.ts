// CSS da tela "Hoje" (página de teste /feedbacks/crm/teste/hoje). Vive DENTRO de .fbn (estiloNovo.ts)
// e usa os mesmos tokens (--s, --b, --soft, --t, --t2, --t3, --c). Estilo POS NewPortal: cantos 16,
// peso máx. 500, sem caixa alta, sem faixa colorida do lado; guias Chrome (docs/padrao-telas.md).
export const ESTILO_HOJE = `
.fbh { padding-top: 0; gap: 14px }
.fbh-faixa { display: flex; align-items: flex-end; gap: 3px; padding: 10px clamp(10px, 2.5vw, 24px) 0; margin: 0 calc(-1 * clamp(10px, 2.5vw, 24px));
  background: linear-gradient(135deg, #f87171, #991b1b); overflow-x: auto; -webkit-overflow-scrolling: touch; box-shadow: 0 1px 4px var(--portal-shadow, rgba(0,0,0,.12)) }
.fbh-guia { padding: 11px 20px; font: inherit; font-size: 15px; font-weight: 500; color: #111111; background: rgba(255,255,255,0.30); border: 0; border-radius: 11px 11px 0 0;
  cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; transition: background .2s }
.fbh-guia:hover { background: rgba(255,255,255,0.45) }
.fbh-guia.on { background: #fefefe; box-shadow: 0 -2px 6px rgba(0,0,0,0.15) }
.fbh-guia .so { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: rgba(17,17,17,.10); color: #111111 }
.fbh-guia i { font-size: 13px }

.fbh-linha-topo { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.fbh-opcoes { display: flex; gap: 2px; border-bottom: 1px solid var(--b); overflow-x: auto }
.fbh-opcoes button { padding: 8px 14px; border: 0; border-radius: 10px 10px 0 0; background: transparent; color: var(--t2); font: inherit; font-size: 13.5px; cursor: pointer; white-space: nowrap }
.fbh-opcoes button.on { background: var(--s); color: var(--t); box-shadow: 0 -1px 0 var(--b) inset, 1px 0 0 var(--b), -1px 0 0 var(--b) }
.fbh-cota { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 10px; border: 1px solid var(--b); border-radius: 11px; background: var(--s); font-size: 13.5px; color: var(--t2) }
.fbh-cota input { width: 56px; height: 28px; border: 1px solid var(--b); border-radius: 8px; background: var(--s); color: var(--t); font: inherit; font-size: 14px; text-align: center; font-variant-numeric: tabular-nums }
.fbh-cota button { width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--b); background: var(--soft); color: var(--t); cursor: pointer; font: inherit }

/* números do topo */
.fbh-conts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(170px, 100%), 1fr)); gap: 10px }
.fbh-cont { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--b); background: var(--s); text-align: left; font: inherit; color: var(--t);
  cursor: pointer; transition: transform .25s, box-shadow .25s, border-color .25s; animation: fbhEntra .45s both }
.fbh-cont:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--k) 35%, var(--b)) }
.fbh-cont.on { border-color: color-mix(in srgb, var(--k) 55%, var(--b)); background: color-mix(in srgb, var(--k) 6%, var(--s)) }
.fbh-cont .fbn-ico { --c: var(--k) }
.fbh-cont b { display: block; font-size: 22px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; line-height: 1.1; color: var(--k) }
.fbh-cont small { font-size: 12.5px; color: var(--t2) }

/* filtros */
.fbh-filtros { display: flex; gap: 8px; flex-wrap: wrap; align-items: center }
.fbh-filtros .fbn-busca { flex: 1 1 260px }
.fbh-filtros select.fbn-campo { width: auto; min-width: 170px; height: 40px; border-radius: 12px }

/* lista de clientes */
.fbh-sec { display: grid; gap: 8px; align-content: start }
.fbh-sec-cab { display: flex; align-items: center; gap: 8px; font-size: 14.5px; color: var(--t); margin: 2px 0 }
.fbh-sec-cab .n { font-size: 12.5px; padding: 1px 9px; border-radius: 999px; background: var(--soft); border: 1px solid var(--b); color: var(--t2); font-variant-numeric: tabular-nums }
.fbh-sec-cab small { color: var(--t2); font-size: 12.5px }
.fbh-depois { border: 1px solid var(--b); border-radius: 16px; background: var(--s); padding: 4px 12px }
.fbh-depois > summary { cursor: pointer; padding: 9px 2px; display: flex; gap: 8px; align-items: center; font-size: 14px; color: var(--t) }
.fbh-depois > summary .n { font-size: 12.5px; padding: 1px 9px; border-radius: 999px; background: var(--soft); color: var(--t2); font-variant-numeric: tabular-nums }
.fbh-depois[open] > summary { border-bottom: 1px solid var(--b); margin-bottom: 8px }
.fbh-depois .fbh-sec { padding-bottom: 10px }
.fbh-mais { justify-self: center; margin: 4px 0 }

.fbh-cli { position: relative; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; gap: 12px; align-items: start; width: 100%; padding: 13px 14px; border-radius: 16px; border: 1px solid var(--b);
  background: linear-gradient(120deg, color-mix(in srgb, var(--cc) 5%, var(--s)) 0%, var(--s) 45%); font: inherit; color: var(--t); text-align: left; cursor: pointer;
  transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s, border-color .22s; animation: fbhEntra .35s both }
.fbh-cli:hover { transform: translateY(-2px); box-shadow: 0 16px 30px -22px color-mix(in srgb, var(--cc) 70%, #0f172a); border-color: color-mix(in srgb, var(--cc) 35%, var(--b)) }
.fbh-cli.sel { border-color: var(--cc); box-shadow: 0 0 0 3px color-mix(in srgb, var(--cc) 14%, transparent), 0 16px 30px -24px color-mix(in srgb, var(--cc) 70%, #0f172a) }
.fbh-cli .ava { position: relative; width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center; font-size: 14.5px; letter-spacing: .02em; color: #fefefe;
  background: linear-gradient(140deg, color-mix(in srgb, var(--cc) 75%, #fefefe), var(--cc)); box-shadow: 0 6px 14px -8px var(--cc); transition: transform .25s }
.fbh-cli:hover .ava { transform: rotate(-4deg) scale(1.05) }
.fbh-cli .pos { position: absolute; right: -6px; bottom: -6px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 99px; display: grid; place-items: center; font-size: 10.5px;
  background: var(--s); color: var(--t2); border: 1px solid var(--b); font-variant-numeric: tabular-nums }
.fbh-cli .pos.urg { background: #dc2626; border-color: #dc2626; color: #fefefe }
.fbh-cli .nm { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 15.5px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere }
.fbh-classe { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 400; padding: 1px 8px 1px 7px; border-radius: 99px; color: color-mix(in srgb, var(--k) 80%, #0f172a); background: color-mix(in srgb, var(--k) 9%, var(--s)) }
.fbh-classe::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--k); box-shadow: 0 0 0 3px color-mix(in srgb, var(--k) 18%, transparent) }
.fbh-cli .sub { font-size: 12.5px; color: var(--t2); display: flex; gap: 4px 14px; flex-wrap: wrap; margin-top: 3px }
.fbh-cli .sub i { color: var(--t3, var(--t2)); margin-right: 2px }
.fbh-cli .faz { display: inline-flex; gap: 7px; align-items: center; max-width: 100%; margin-top: 9px; padding: 5px 12px 5px 10px; border-radius: 10px; font-size: 13px;
  color: color-mix(in srgb, var(--k) 85%, #0f172a); background: color-mix(in srgb, var(--k) 8%, var(--s)); transition: background .2s }
.fbh-cli .faz .tx { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0 }
.fbh-cli .faz i { color: var(--k); font-size: 12px }
.fbh-cli .faz .seta { font-size: 11px; opacity: 0; transform: translateX(-6px); transition: opacity .2s, transform .2s }
.fbh-cli:hover .faz { background: color-mix(in srgb, var(--k) 14%, var(--s)) }
.fbh-cli:hover .faz .seta, .fbh-cli.sel .faz .seta { opacity: 1; transform: none }
.fbh-selos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px }
.fbh-selo { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 10px; border-radius: 8px; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis;
  color: color-mix(in srgb, var(--k) 78%, #0f172a); background: color-mix(in srgb, var(--k) 8%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 14%, transparent) }
.fbh-selo i { font-size: 10.5px; color: var(--k) }
.fbh-selo.fraco { opacity: .72 }
.fbh-pts { font-size: 12.5px; padding: 4px 11px; border-radius: 999px; font-variant-numeric: tabular-nums; white-space: nowrap; border: 1px solid var(--b); background: var(--soft); color: var(--t2) }
.fbh-pts.alto { color: color-mix(in srgb, var(--cc) 80%, #0f172a); background: color-mix(in srgb, var(--cc) 10%, var(--s)); border-color: color-mix(in srgb, var(--cc) 28%, transparent) }
.fbh-cabeca { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: flex-start }
.fbh-cabeca > .fbf-como { padding-top: 10px }
.fbh-cabeca .fbf-topo { margin: 0 }

/* opção 1: lista + painel */
.fbh-o1 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(380px, 500px); gap: 14px; align-items: start }
.fbh-lado { position: sticky; top: 90px; max-height: calc(100vh - 110px); overflow-y: auto; display: grid; gap: 12px; align-content: start }
.fbh-lado-vazio { padding: 40px 20px; text-align: center; color: var(--t2); font-size: 14px; background: var(--s); border: 1px dashed var(--b); border-radius: 16px }
.fbh-fechar { display: none }
/* opção 2: um por vez */
.fbh-o2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(260px, 340px); gap: 14px; align-items: start }
.fbh-o2-nav { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; font-size: 13.5px; color: var(--t2) }
.fbh-o2-nav b { color: var(--t); font-variant-numeric: tabular-nums }
.fbh-prox { display: grid; gap: 8px; position: sticky; top: 90px }
/* opção 3: cartões */
.fbh-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 10px }

/* painel do cliente */
.fbh-painel { background: var(--s); border: 1px solid var(--b); border-radius: 16px; padding: 16px; display: grid; gap: 14px; min-width: 0; animation: fbhEntra .3s both }
.fbh-cab { display: flex; gap: 11px; align-items: flex-start }
.fbh-cab h2 { font-size: 19px; font-weight: 500; margin: 0; letter-spacing: -.01em; line-height: 1.25; overflow-wrap: anywhere }
.fbh-porque { display: grid; gap: 5px; padding: 12px 14px; border-radius: 14px; background: color-mix(in srgb, var(--k, var(--c)) 6%, var(--s)); border: 1px solid color-mix(in srgb, var(--k, var(--c)) 22%, transparent) }
.fbh-porque .t { font-size: 15px; font-weight: 500; display: flex; gap: 8px; align-items: center; flex-wrap: wrap }
.fbh-porque .l { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; font-size: 13px; color: var(--t2); align-items: baseline }
.fbh-porque .l span:last-child { font-variant-numeric: tabular-nums; color: var(--t); white-space: nowrap }
.fbh-porque .tot { border-top: 1px solid color-mix(in srgb, var(--k, var(--c)) 20%, transparent); padding-top: 5px; color: var(--t) }
.fbh-motivos { display: grid; gap: 6px }
.fbh-motivo { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--b); border-radius: 12px; background: var(--s) }
.fbh-motivo .fbn-ico { width: 32px; height: 32px; border-radius: 9px; font-size: 13px; --c: var(--k) }
.fbh-motivo .s { font-size: 13.5px; color: var(--t) }
.fbh-motivo .p { font-size: 12.5px; color: var(--t2); margin-top: 1px }
.fbh-motivo.espera { opacity: .7 }
.fbh-motivo.clica { cursor: pointer; transition: border-color .2s, box-shadow .2s }
.fbh-motivo.clica:hover { border-color: color-mix(in srgb, var(--k) 45%, var(--b)); box-shadow: 0 10px 22px -18px rgba(15,23,42,.55) }
.fbh-motivo .mq { font-size: 12.5px; color: var(--t); margin-bottom: 2px; line-height: 1.45 }
.fbh-motivo .mq .ver { margin-left: 6px }
.fbh-motivo .mq > i { color: #0f766e; font-size: 11.5px }
.fbh-motivo .mq .ver { color: #0369a1; white-space: nowrap } .fbh-motivo .mq .ver i { font-size: 9px }
.fbh-passos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(102px, 100%), 1fr)); gap: 8px }
.fbh-passo { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--b); background: var(--s); font: inherit; color: var(--t);
  cursor: pointer; text-align: left; transition: border-color .2s, background .2s, transform .2s }
.fbh-passo:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--k) 45%, var(--b)) }
.fbh-passo.on { background: color-mix(in srgb, var(--k) 10%, var(--s)); border-color: color-mix(in srgb, var(--k) 55%, transparent) }
.fbh-passo i { color: var(--k); font-size: 15px }
.fbh-passo span { font-size: 14px }
.fbh-passo small { font-size: 12px; color: var(--t2) }
.fbh-passo[disabled] { opacity: .45; cursor: default; transform: none }
.fbh-plano { display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: var(--soft); border: 1px solid var(--b) }
.fbh-plano .rot { font-size: 13px; color: var(--t2); margin-bottom: 2px }
.fbh-plano label, .fbh-plano .it { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: start; font-size: 13.5px; color: var(--t); cursor: pointer }
.fbh-plano .it { cursor: default }
.fbh-plano input[type=checkbox] { width: 17px; height: 17px; margin: 1px 0 0; accent-color: var(--c) }
.fbh-plano small { display: block; color: var(--t2); font-size: 12.5px }
.fbh-plano .it i { margin-top: 3px; text-align: center; color: var(--t3) }
.fbh-confirmar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center }
.fbh-sim { font-size: 12.5px; color: #7c3aed; display: inline-flex; gap: 6px; align-items: center }
.fbh-sim.real { color: #b91c1c }
.fbh-det { border: 1px solid var(--b); border-radius: 14px; padding: 2px 12px; background: var(--s) }
.fbh-det > summary { cursor: pointer; padding: 9px 0; font-size: 13.5px; color: var(--t); display: flex; gap: 8px; align-items: center }
.fbh-det[open] { padding-bottom: 12px }

/* painel do gerente */
.fbh-pg { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); gap: 12px; align-items: start }
.fbh-cartao { background: var(--s); border: 1px solid var(--b); border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px; min-width: 0; animation: fbhEntra .45s both }
.fbh-cartao h3 { margin: 0; font-size: 16px; font-weight: 500; display: flex; gap: 10px; align-items: center }
.fbh-cartao h3 .fbn-ico { width: 32px; height: 32px; border-radius: 9px; font-size: 14px; --c: var(--k) }
.fbh-cartao h3 small { margin-left: auto; font-size: 12.5px; color: var(--t2) }
.fbh-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: baseline; font-size: 13.5px; padding: 7px 0; border-top: 1px solid var(--b) }
.fbh-item:first-of-type { border-top: 0 }
.fbh-item .d { font-size: 12.5px; color: var(--t2) }
.fbh-item .v { font-variant-numeric: tabular-nums; white-space: nowrap }
.fbh-barras { display: grid; gap: 7px }
.fbh-barra { display: grid; grid-template-columns: minmax(110px, 38%) minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 13px; background: transparent; border: 0; padding: 2px 0;
  font: inherit; color: var(--t); text-align: left; cursor: pointer; width: 100% }
.fbh-barra[disabled] { cursor: default }
.fbh-barra .r { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--t2) }
.fbh-barra .trilho { display: block; height: 10px; border-radius: 999px; background: var(--soft); overflow: hidden }
.fbh-barra .enche { display: block; height: 100%; border-radius: 999px; background: var(--k); width: 0; animation: fbhCresce .8s cubic-bezier(.2,.8,.2,1) both }
.fbh-barra .v { font-variant-numeric: tabular-nums; min-width: 34px; text-align: right }
.fbh-barra:not([disabled]):hover .r { color: var(--t) }
.fbh-vivo { display: inline-flex; gap: 7px; align-items: center; font-size: 12.5px; color: var(--t2) }
.fbh-vivo .pt { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; animation: fbhPulso 1.6s infinite }
.fbh-regra { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px 14px; border: 1px solid var(--b); border-radius: 16px; background: var(--s); animation: fbhEntra .4s both }
.fbh-regra .fbn-ico { --c: var(--k) }
.fbh-regra.clica { cursor: pointer; transition: border-color .2s, box-shadow .2s }
.fbh-regra.clica:hover { border-color: color-mix(in srgb, var(--k) 40%, var(--b)) }
.fbh-regra.on { border-color: color-mix(in srgb, var(--k) 60%, var(--b)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--k) 12%, transparent) }
.fbh-regra h4 { margin: 0; font-size: 15px; font-weight: 500 }
.fbh-regra p { margin: 3px 0 0; font-size: 13.5px; color: var(--t2); line-height: 1.45 }
.fbh-regra .num { text-align: right }
.fbh-regra .num b { display: block; font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--k) }
.fbh-regra .num small { font-size: 12px; color: var(--t2) }
.fbh-construcao { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; padding: 2px 10px; border-radius: 999px; color: #92400e; background: color-mix(in srgb, #d97706 12%, var(--s)); border: 1px solid color-mix(in srgb, #d97706 30%, transparent) }

@keyframes fbhEntra { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
@keyframes fbhCresce { from { width: 0 } }
@keyframes fbhPulso { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.5) } 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0) } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0) } }

@media (max-width: 1100px) {
  .fbh-o2 { grid-template-columns: minmax(0, 1fr) }
  .fbh-prox { position: static }
}
@media (max-width: 960px) {
  .fbh-o1 { grid-template-columns: minmax(0, 1fr) }
  .fbh-lado { position: fixed; left: 0; right: 0; bottom: 0; top: auto; max-height: 86vh; z-index: 9001; border-radius: 18px 18px 0 0;
    background: var(--portal-bg, #f8fafc); padding: 12px; box-shadow: 0 -18px 40px -20px rgba(15,23,42,.6); animation: fbfSobe .25s }
  .fbh-lado.vazio { display: none }
  .fbh-fechar { display: flex; justify-content: center }
}
@media (max-width: 640px) {
  .fbh-guia { padding: 10px 14px; font-size: 14px }
  .fbh-cont { padding: 10px 12px } .fbh-cont .fbn-ico { width: 34px; height: 34px }
  .fbh-filtros select.fbn-campo { flex: 1 1 100% }
  .fbh-cli { grid-template-columns: 38px minmax(0, 1fr); } .fbh-cli .ava { width: 36px; height: 36px; font-size: 13px } .fbh-cli > .fbh-pts { grid-column: 2; justify-self: start }
  .fbh-barra { grid-template-columns: minmax(90px, 40%) minmax(0, 1fr) auto }
  .fbh-regra { grid-template-columns: 40px minmax(0, 1fr) } .fbh-regra .num { grid-column: 2; text-align: left }
}
@media (prefers-reduced-motion: reduce) {
  .fbh-cont, .fbh-cli, .fbh-painel, .fbh-cartao, .fbh-regra, .fbh-lado, .fbh-barra .enche { animation: none }
  .fbh-barra .enche { width: var(--w) }
  .fbh-cont, .fbh-cli, .fbh-passo { transition: none }
  .fbh-vivo .pt { animation: none }
}

/* Janela do cliente (26/10) */
.fbh-jan-fundo { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; gap: 14px; padding: 16px; animation: fbhEntra .2s both }
.fbh-jan { width: min(1500px, calc(100% - 132px)); height: 92vh; max-height: 92vh; display: flex; flex-direction: column; background: var(--soft); border-radius: 20px; overflow: hidden; box-shadow: 0 30px 80px -30px rgba(15,23,42,.6) }
.fbh-jan-cab { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: var(--s); border-bottom: 1px solid var(--b) }
.fbh-jan-cab .t { flex: 1; font-size: 13.5px; color: var(--t2) }
.fbh-jan-corpo { flex: 1; overflow-y: auto; padding: 16px 18px }
.fbh-jan-lado { flex: none; width: 52px; height: 52px; border-radius: 50%; border: 0; background: var(--s); color: var(--t); font-size: 18px; cursor: pointer; display: grid; place-items: center; box-shadow: 0 10px 28px -12px rgba(15,23,42,.6); transition: transform .15s, background .15s, color .15s }
.fbh-jan-lado:hover:not(:disabled) { transform: scale(1.08); background: #dc2626; color: #fff }
.fbh-jan-lado:disabled { opacity: .3; cursor: default }
.fbh-painel.modal { grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); align-items: start; animation: none }
.fbh-painel.modal > .fbh-cab, .fbh-painel.modal > .fbh-porque, .fbh-painel.modal > .fbh-fechar, .fbh-painel.modal > .fbh-col-baixo { grid-column: 1 / -1 }
.fbh-col-esq, .fbh-col-dir, .fbh-col-baixo { display: grid; gap: 10px; align-content: start; min-width: 0 }
.fbh-maq { border: 1px solid var(--b); border-radius: 16px; padding: 10px; display: grid; gap: 8px; background: var(--s) }
.fbh-maq.outros { background: var(--soft) }
.fbh-maq-cab { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.fbh-maq-cab .t { font-size: 14px; color: var(--t); font-weight: 500; overflow-wrap: anywhere }
.fbh-maq-cab .p { font-size: 12.5px; color: var(--t2) }
.fbh-maq-cab .t.grande { font-size: 17px; line-height: 1.25 }
.fbh-bloco { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin: 10px 0 2px; padding: 8px 12px; border-radius: 12px; background: color-mix(in srgb, var(--k) 7%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 22%, var(--b)) }
.fbh-bloco b { font-size: 15px; font-weight: 500; color: var(--t) }
.fbh-bloco .fbn-ico { --c: var(--k) }
.fbh-bloco .n { font-size: 12px; padding: 1px 9px; border-radius: 99px; color: #fefefe; background: var(--k) }
.fbh-bloco small { font-size: 12.5px; color: var(--t2) }
.fbh-maq-cab .alvo { display: flex; gap: 10px; align-items: center; flex: 1; min-width: 0; padding: 0; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; border-radius: 12px }
.fbh-maq-cab .alvo:hover .t { color: #0f766e; text-decoration: underline; text-underline-offset: 3px }
.fbh-maq-cab .alvo .dica { font-size: 12px; color: #0f766e }
@media (max-width: 860px) {
  .fbh-jan-fundo { padding: 0; align-items: stretch }
  .fbh-jan { width: 100%; height: 100vh; max-height: 100vh; border-radius: 0 }
  .fbh-jan-lado { position: fixed; bottom: 14px; z-index: 2; width: 44px; height: 44px } .fbh-jan-lado:first-child { left: 14px } .fbh-jan-lado:last-child { right: 14px }
  .fbh-painel.modal { grid-template-columns: minmax(0, 1fr) }
}

/* Por que ligar: cartões com o número grande (26/10) */
.fbh-motivo-rot { font-size: 14px; color: var(--t); font-weight: 500; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap }
.fbh-motivo-rot small { font-size: 12.5px; color: var(--t2); font-weight: 400 }
.fbh-tipos { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px }
.fbh-tipo { position: relative; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto auto; column-gap: 10px; text-align: left; padding: 10px 12px; border-radius: 16px; cursor: pointer; font-family: inherit;
  background: var(--s); border: 1px solid var(--b); color: var(--t); transition: transform .15s, border-color .15s, background .15s, box-shadow .15s }
.fbh-tipo:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--k) 40%, var(--b)); box-shadow: 0 8px 20px -14px color-mix(in srgb, var(--k) 60%, transparent) }
.fbh-tipo .i { grid-row: 1 / 4; width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 15px; position: relative;
  color: var(--k); background: color-mix(in srgb, var(--k) 10%, var(--s)) }
.fbh-tipo .i .ok { position: absolute; right: -5px; top: -5px; width: 17px; height: 17px; border-radius: 50%; font-size: 9px; display: grid; place-items: center; background: var(--k); color: #fefefe }
.fbh-tipo b { font-size: 22px; font-weight: 500; line-height: 1.1; font-variant-numeric: tabular-nums }
.fbh-tipo .r { font-size: 13.5px; color: var(--t) }
.fbh-tipo small { font-size: 11.5px; color: var(--t2); line-height: 1.3 }
.fbh-tipo.on { background: color-mix(in srgb, var(--k) 9%, var(--s)); border-color: var(--k); box-shadow: 0 0 0 1px var(--k) inset }
.fbh-tipo.zero { opacity: .55 }
.fbh-chaves { display: flex; gap: 8px; flex-wrap: wrap }
.fbh-chave { display: inline-flex; gap: 8px; align-items: center; height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--b); background: var(--s); color: var(--t); font: inherit; font-size: 13.5px; cursor: pointer; white-space: nowrap }
.fbh-chave:disabled { opacity: .5; cursor: default }
.fbh-chave .sw { width: 30px; height: 17px; border-radius: 999px; background: var(--b); position: relative; transition: background .15s; flex: none }
.fbh-chave .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%; background: #fefefe; transition: left .15s }
.fbh-chave.on { border-color: var(--k); background: color-mix(in srgb, var(--k) 8%, var(--s)) }
.fbh-chave.on .sw { background: var(--k) } .fbh-chave.on .sw::after { left: 15px }
.fbh-chave .n { font-size: 12px; padding: 0 7px; border-radius: 999px; background: color-mix(in srgb, var(--k) 12%, var(--s)) }

/* Revisões em destaque, outros recolhidos (26/10) */
.fbh-rev { display: flex; gap: 14px; align-items: center; width: 100%; text-align: left; padding: 14px 18px; border-radius: 16px; cursor: pointer; font-family: inherit; color: var(--t);
  background: color-mix(in srgb, var(--k) 7%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 30%, var(--b)); transition: box-shadow .15s, transform .15s }
.fbh-rev:hover { transform: translateY(-1px); box-shadow: 0 10px 24px -16px color-mix(in srgb, var(--k) 70%, transparent) }
.fbh-rev.on { border-color: var(--k); box-shadow: 0 0 0 1px var(--k) inset }
.fbh-rev .i { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; font-size: 22px; flex: none; color: #fefefe; background: var(--k) }
.fbh-rev .tx { flex: 1; min-width: 0; display: grid; grid-template-columns: auto 1fr; column-gap: 10px; align-items: baseline }
.fbh-rev .tx b { font-size: 30px; font-weight: 500; line-height: 1.1; font-variant-numeric: tabular-nums }
.fbh-rev .tx .r { font-size: 16px; font-weight: 500 }
.fbh-rev .tx small { grid-column: 1 / -1; font-size: 13px; color: var(--t2); line-height: 1.4; margin-top: 2px }
.fbh-rev .acao { flex: none; font-size: 13.5px; color: var(--k); white-space: nowrap }
.fbh-outros { font-size: 13px; color: var(--t2) }
.fbh-outros summary { list-style: none; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; padding: 4px 2px; flex-wrap: wrap }
.fbh-outros summary::-webkit-details-marker { display: none }
.fbh-outros summary .seta { font-size: 10px; transition: transform .15s }
.fbh-outros[open] summary .seta { transform: rotate(90deg) }
.fbh-outros summary .n { font-size: 12px; padding: 0 8px; border-radius: 999px; background: var(--soft); border: 1px solid var(--b) }
.fbh-outros summary .marc { color: var(--t) }
.fbh-outros-lista { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px }
.fbh-outros-lista .fbn-chip { font-size: 12.5px; padding: 4px 10px }
@media (max-width: 640px) { .fbh-rev { flex-wrap: wrap } .fbh-rev .acao { width: 100%; text-align: right } }

/* Painel → Ao vivo (28/10/2026) */
.fbp { display: grid; gap: 14px }
.fbp-zero b { color: var(--t3, #94a3b8) !important } .fbp-zero .fbn-ico { filter: grayscale(1); opacity: .55 }
.fbp-grade { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(320px, 1fr); gap: 14px; align-items: start }
.fbp-col { display: grid; gap: 14px; min-width: 0 }
.fbp-vazio { display: flex; gap: 10px; align-items: center; padding: 18px; border-radius: 12px; background: var(--soft); color: var(--t2); font-size: 13.5px }
.fbp-vazio i { font-size: 18px; color: var(--t3, #94a3b8) } .fbp-vazio.ok i { color: #16a34a }
.fbp-equipe { display: grid }
.fbp-eq-cab, .fbp-eq { display: grid; grid-template-columns: minmax(150px, 1.2fr) minmax(0, 1.3fr) minmax(120px, 1fr) minmax(110px, .9fr); gap: 12px; align-items: center }
.fbp-eq-cab { font-size: 12px; color: var(--t2); padding: 0 8px 6px }
.fbp-eq { padding: 9px 8px; border-top: 1px solid var(--b); border-radius: 10px; animation: fbhEntra .35s both; transition: background .2s }
.fbp-eq:hover { background: var(--soft) }
.fbp-eq.ao-vivo { background: color-mix(in srgb, #d97706 6%, var(--s)) }
.fbp-eq .quem { display: flex; gap: 10px; align-items: center; min-width: 0 }
.fbp-eq .av { flex: none; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 12.5px; color: #fefefe; background: linear-gradient(140deg, #60a5fa, #2563eb) }
.fbp-eq.ao-vivo .av { background: linear-gradient(140deg, #fbbf24, #d97706); animation: fbpLig 1.8s infinite }
.fbp-eq .nm { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbp-lig { display: inline-flex; gap: 6px; align-items: center; max-width: 100%; font-size: 12.5px; padding: 3px 10px; border-radius: 99px; color: #92400e; background: color-mix(in srgb, #d97706 12%, var(--s)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbp-lig.esq { color: #b91c1c; background: color-mix(in srgb, #dc2626 10%, var(--s)) }
.fbp-eq .livre { font-size: 12.5px; color: var(--t3, #94a3b8) }
.fbp-eq .feitos { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center }
.fbp-eq .feitos .trilho, .fbp-mot .trilho { display: block; height: 8px; border-radius: 99px; background: var(--soft); overflow: hidden }
.fbp-eq .feitos .enche { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #4ade80, #16a34a); animation: fbhCresce .8s cubic-bezier(.2,.8,.2,1) both }
.fbp-eq .feitos .n { font-size: 14px; font-variant-numeric: tabular-nums; min-width: 22px; text-align: right }
.fbp-eq .semana { font-size: 12.5px; color: var(--t2); white-space: nowrap } .fbp-eq .conv { color: #0f766e }
.fbp-desf { display: grid; gap: 6px; font-size: 12.5px; color: var(--t2); padding-top: 8px; border-top: 1px dashed var(--b) }
.fbp-lista { display: grid; gap: 2px }
.fbp-li { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px; border-radius: 12px; background: transparent; border: 0; font: inherit; color: var(--t); text-align: left; width: 100% }
button.fbp-li { cursor: pointer } .fbp-li:hover { background: var(--soft) }
.fbp-li .av { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 13.5px; background: var(--soft); color: var(--t2) }
.fbp-li .av.ruim { background: color-mix(in srgb, #dc2626 12%, var(--s)); color: #b91c1c }
.fbp-li .tx { display: grid; min-width: 0 } .fbp-li .t { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbp-li .d { font-size: 12.5px; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbp-li .q { font-size: 12.5px; color: var(--t2); font-variant-numeric: tabular-nums; white-space: nowrap }
.fbp-li .q.dias { padding: 2px 9px; border-radius: 99px; background: var(--soft) } .fbp-li .q.velho { color: #b91c1c; background: color-mix(in srgb, #dc2626 9%, var(--s)) }
.fbp-mais { justify-self: center; margin-top: 6px }
.fbp-fila { position: sticky; top: 12px }
.fbp-fila-n { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px }
.fbp-fila-n > span { display: grid; gap: 2px; padding: 10px 12px; border-radius: 12px; background: var(--soft) }
.fbp-fila-n b { font-size: 22px; font-weight: 500; font-variant-numeric: tabular-nums; line-height: 1.1 } .fbp-fila-n b.urg { color: #b91c1c }
.fbp-fila-n small { font-size: 12px; color: var(--t2) }
.fbp-motivos { display: grid; gap: 2px }
.fbp-mot { display: grid; grid-template-columns: 28px minmax(100px, 40%) minmax(0, 1fr) 44px 14px; gap: 10px; align-items: center; padding: 7px 6px; border: 0; border-radius: 10px; background: transparent; font: inherit; font-size: 13.5px; color: var(--t); text-align: left; cursor: pointer; transition: background .2s }
.fbp-mot[disabled] { cursor: default } .fbp-mot:not([disabled]):hover { background: color-mix(in srgb, var(--k) 7%, var(--s)) }
.fbp-mot .ic { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; font-size: 12px; color: var(--k); background: color-mix(in srgb, var(--k) 12%, var(--s)) }
.fbp-mot .r { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbp-mot .enche { display: block; height: 100%; border-radius: 99px; background: var(--k); animation: fbhCresce .8s cubic-bezier(.2,.8,.2,1) both }
.fbp-mot .v { font-variant-numeric: tabular-nums; text-align: right }
.fbp-mot .seta { font-size: 11px; color: var(--k); opacity: 0; transform: translateX(-4px); transition: opacity .2s, transform .2s }
.fbp-mot:not([disabled]):hover .seta { opacity: 1; transform: none }
.fbp-pontos { display: grid; gap: 8px; padding-top: 10px; border-top: 1px dashed var(--b) }
.fbp-pontos .tit { font-size: 13.5px } .fbp-pontos .tit small { font-size: 12px; color: var(--t2); margin-left: 6px }
.fbp-pilha { display: flex; height: 14px; border-radius: 99px; overflow: hidden; gap: 2px; background: var(--soft) }
.fbp-pilha > span { min-width: 4px; transition: flex-grow .6s }
.fbp-leg { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--t2) }
.fbp-leg > span { display: inline-flex; gap: 6px; align-items: center } .fbp-leg i { width: 9px; height: 9px; border-radius: 3px }
.fbp-leg b { font-weight: 500; color: var(--t) } .fbp-leg small { font-size: 11.5px }
@keyframes fbpLig { 0%, 100% { box-shadow: 0 0 0 0 rgba(217,119,6,.45) } 60% { box-shadow: 0 0 0 7px rgba(217,119,6,0) } }
@media (max-width: 1100px) { .fbp-grade { grid-template-columns: 1fr } .fbp-fila { position: static } }
@media (max-width: 700px) {
  .fbp-eq-cab { display: none }
  .fbp-eq { grid-template-columns: minmax(0, 1fr) auto; } .fbp-eq .agora { grid-column: 1 / -1; order: 3 } .fbp-eq .semana { grid-column: 1 / -1; order: 4 }
  .fbp-mot { grid-template-columns: 28px minmax(0, 1fr) 70px 40px 0 }
}
@media (prefers-reduced-motion: reduce) { .fbp-eq, .fbp-eq .feitos .enche, .fbp-mot .enche, .fbp-eq.ao-vivo .av { animation: none } }

/* Linha do cliente: "Por que ligar" em lista (28/10/2026) */
.fbh-urg { display: inline-flex; gap: 4px; align-items: center; font-size: 11.5px; font-weight: 400; padding: 1px 8px; border-radius: 99px; color: #b91c1c; background: color-mix(in srgb, #dc2626 10%, var(--s)) }
.fbh-pq { display: grid; gap: 3px; margin-top: 9px }
.fbh-pq .cab { font-size: 11.5px; color: var(--t3, #94a3b8); letter-spacing: .01em }
.fbh-mt { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 10px; align-items: center; font-size: 13px; padding: 3px 0 }
.fbh-mt .tp { display: inline-flex; gap: 6px; align-items: center; justify-self: start; max-width: 100%; font-size: 12px; padding: 2px 9px; border-radius: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: color-mix(in srgb, var(--k) 82%, #0f172a); background: color-mix(in srgb, var(--k) 11%, var(--s)) }
.fbh-mt .tp i { font-size: 10.5px; color: var(--k) }
.fbh-mt .dt { color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbh-mt.principal .dt { color: var(--t) }
.fbh-mt.fraco { opacity: .72 }
.fbh-mt-mais { font-size: 12px; color: var(--t2); padding-left: 200px }
.fbh-dir { display: grid; gap: 6px; justify-items: end; align-content: start }
.fbh-acao { display: inline-flex; gap: 7px; align-items: center; padding: 6px 12px; border-radius: 10px; font-size: 13.5px; white-space: nowrap;
  color: color-mix(in srgb, var(--k) 88%, #0f172a); background: color-mix(in srgb, var(--k) 10%, var(--s)); transition: background .2s }
.fbh-acao i { color: var(--k); font-size: 12px }
.fbh-acao .seta { font-size: 11px; opacity: 0; width: 0; transform: translateX(-6px); transition: opacity .2s, transform .2s, width .2s }
.fbh-cli:hover .fbh-acao { background: color-mix(in srgb, var(--k) 16%, var(--s)) }
.fbh-cli:hover .fbh-acao .seta, .fbh-cli.sel .fbh-acao .seta { opacity: 1; width: 11px; transform: none }
.fbh-acao-tx { font-size: 12px; color: var(--t2); max-width: 200px; text-align: right }
@media (max-width: 640px) {
  .fbh-cli > .fbh-dir { grid-column: 2; justify-items: start; grid-auto-flow: column; justify-content: start; align-items: center }
  .fbh-mt { grid-template-columns: 1fr; gap: 2px } .fbh-mt-mais { padding-left: 0 }
}

/* Listas do dia: CRM × RFM × Outros × Tudo (28/10/2026) */
.fbh-listas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: 8px }
.fbh-listas > button { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--b); background: var(--s); font: inherit; color: var(--t); text-align: left; cursor: pointer;
  transition: transform .2s, box-shadow .2s, border-color .2s, background .2s }
.fbh-listas > button:hover { transform: translateY(-2px); box-shadow: 0 14px 26px -22px var(--k); border-color: color-mix(in srgb, var(--k) 35%, var(--b)) }
.fbh-listas > button.on { border-color: var(--k); background: color-mix(in srgb, var(--k) 7%, var(--s)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--k) 12%, transparent) }
.fbh-listas .ic { flex: none; width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 15px; color: var(--k); background: color-mix(in srgb, var(--k) 12%, var(--s)); transition: background .2s, color .2s }
.fbh-listas > button.on .ic { color: #fefefe; background: var(--k) }
.fbh-listas .tx { display: grid; min-width: 0 }
.fbh-listas .r { font-size: 15px; font-weight: 500 }
.fbh-listas .r .n { font-size: 12.5px; font-weight: 400; padding: 1px 8px; margin-left: 4px; border-radius: 99px; background: var(--soft); color: var(--t2); font-variant-numeric: tabular-nums }
.fbh-listas > button.on .r .n { background: color-mix(in srgb, var(--k) 14%, var(--s)); color: color-mix(in srgb, var(--k) 85%, #0f172a) }
.fbh-listas small { font-size: 12px; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }

/* Histórico de atendimento do cliente, separado do bloco de atendimento (28/10/2026) */
.fbh-hist { padding: 12px; border-radius: 16px; background: var(--soft); border: 1px solid var(--b) }
.fbh-hist-cab { display: flex; gap: 10px; align-items: center }
.fbh-hist-cab b { display: block; font-size: 14.5px; font-weight: 500; color: var(--t) }
.fbh-hist-cab small { font-size: 12px; color: var(--t2) }
.fbh-hist-it > summary { list-style: none; gap: 10px }
.fbh-hist-it > summary::-webkit-details-marker { display: none }
.fbh-hist-it > summary .ic { flex: none; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-size: 13px; color: var(--k); background: color-mix(in srgb, var(--k) 12%, var(--s)) }
.fbh-hist-it > summary .tx { display: grid; min-width: 0; flex: 1 }
.fbh-hist-it > summary .tx b { font-weight: 500; font-size: 13.5px }
.fbh-hist-it > summary .tx small { font-size: 12px; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fbh-hist-it > summary .seta { font-size: 11px; color: var(--t2); transition: transform .2s }
.fbh-hist-it[open] > summary .seta { transform: rotate(180deg) }
.fbh-hist-it:hover { border-color: color-mix(in srgb, var(--t2) 30%, var(--b)) }

/* Iniciar atendimento antes do "Como foi?" (28/10/2026) */
.fbh-at-ini { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; padding: 14px 16px; border-radius: 16px; border: 1px solid color-mix(in srgb, #2563eb 30%, var(--b)); background: linear-gradient(135deg, color-mix(in srgb, #2563eb 7%, var(--s)), var(--s) 65%) }
.fbh-at-ini .ic { width: 42px; height: 42px; flex: none; border-radius: 12px; display: grid; place-items: center; font-size: 17px; color: #fefefe; background: linear-gradient(140deg, #60a5fa, #2563eb) }
.fbh-at-ini .tx { flex: 1 1 220px; display: grid; gap: 2px; min-width: 0 }
.fbh-at-ini .tx b { font-weight: 500; font-size: 15px } .fbh-at-ini .tx small { font-size: 12.5px; color: var(--t2) }
.fbh-at-ini .fbn-acao.cheio { background: #16a34a; border-color: #16a34a; height: 42px; padding: 0 18px; font-size: 14.5px }
.fbh-at-and { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 10px 14px; border-radius: 14px; border: 1px solid color-mix(in srgb, #16a34a 40%, var(--b)); background: color-mix(in srgb, #16a34a 6%, var(--s)) }
.fbh-at-and b { font-weight: 500; color: #15803d } .fbh-at-and small { font-size: 12.5px; color: var(--t2) }
.fbh-at-and .pulso { width: 10px; height: 10px; border-radius: 50%; background: #16a34a; animation: fbhPulsoA 1.6s ease-in-out infinite }
@keyframes fbhPulsoA { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, #16a34a 25%, transparent) } }
.fbh-at-cancelar { margin-left: auto; background: none; border: 0; font: inherit; font-size: 12.5px; color: var(--t2); cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.fbh-at-cancelar:hover { color: #b91c1c }
`;
