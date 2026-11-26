"use client";
// Visual do PPV igual ao do POS (roteiro ppv-estilo-pos.md, 24/11/2026). SÓ APARÊNCIA:
// tudo escopado em `body.ppv-vn` — tirar a classe do <body> devolve o PPV exatamente como era.
// O POS não é tocado: as regras aqui são CÓPIAS adaptadas de src/components/pos/VisualNovoPOS.tsx.
//
// FORMA do POS (fonte, tamanhos, cantos, jeito das abas/botões/cards) com as CORES do PPV (José, 24/11/2026:
// "deixar fonte, estilo, forma de fazer as coisas iguais, preservando a cor e funções do ppv").
// Cores num lugar só: --ppv-acao (botões/ativos) e --cor-aba (abas, ícones) = o laranja de Peças.
import { useEffect } from "react";

/** Liga a classe no <body> enquanto a página do PPV estiver montada (e tira ao sair). */
export function usePpvVisualNovo() {
  useEffect(() => {
    document.body.classList.add("ppv-vn");
    return () => document.body.classList.remove("ppv-vn");
  }, []);
}

export const ESTILO_PPV_VN = `
/* ---------- tokens (equivalente ao .pos-container) ---------- */
body.ppv-vn {
  --ppv-acao: #E8730C;
  --cor-aba: #EA580C;
}
body.ppv-vn .ppv-vn-page {
  --surface: var(--ppv-surface); --border: var(--ppv-border-light); --bg-soft: var(--ppv-primary-light); --bg: var(--portal-bg, #f1f5f9);
  --primary: var(--ppv-acao); --primary-dark: var(--ppv-primary-dark);
  --success: #2E7D32; --warning: #E65100; --danger: #C41E2A;
  font-family: 'Poppins', sans-serif; font-size: 15px; color: #0f172a;
  background: var(--bg);
}
[data-theme="dark"] body.ppv-vn .ppv-vn-page, body.ppv-vn[data-theme="dark"] .ppv-vn-page {
  --bg: var(--portal-bg); --surface: var(--portal-bg-card); --border: var(--portal-border); --bg-soft: var(--portal-bg-secondary, #262626);
  color: var(--portal-text);
}
body.ppv-vn .ppv-vn-page .ppv-vn-fundo { background: var(--bg) !important }

/* ---------- 3.1 barra de ferramentas ---------- */
body.ppv-vn .ppv-tb { background: var(--surface) !important; border-bottom: 1px solid var(--border) !important; padding: 16px 30px !important; box-shadow: 0 1px 3px rgba(0,0,0,.04); position: sticky; top: 0; z-index: 20 }
body.ppv-vn .ppv-busca { flex: 0 1 560px !important }
body.ppv-vn .ppv-busca > i { left: 16px !important; color: #64748b !important }
body.ppv-vn .ppv-busca-input { height: 43px; padding: 0 36px 0 44px !important; border: 1px solid var(--border) !important; border-radius: 12px !important; background: var(--surface) !important; color: var(--portal-text, #0f172a); box-shadow: 0 1px 2px rgba(15,23,42,.05) }
body.ppv-vn .ppv-busca-input:focus { border-color: var(--ppv-acao) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ppv-acao) 15%, transparent) }
body.ppv-vn .ppv-tb-prod { height: 43px; padding: 0 16px !important; border: 1px solid var(--border) !important; border-radius: 10px !important; background: var(--surface) !important; color: var(--portal-text, #0f172a) !important; font-weight: 500 !important }
body.ppv-vn .ppv-tb-prod:hover { border-color: var(--ppv-acao) !important; color: var(--ppv-acao) !important }
body.ppv-vn .ppv-tb-acoes { margin-left: auto }
/* Menu e "+" com a forma do POS e o laranja do PPV (o gradiente do POS mistura com azul-céu) */
body.ppv-vn .ppv-tb-acoes .ms-bt { background: linear-gradient(135deg, #F7B23B, var(--ppv-acao) 55%, #c2570a) !important; box-shadow: 0 6px 16px -6px rgba(232,115,12,.55) !important }
body.ppv-vn .ppv-tb-acoes .rd-bt { box-shadow: 0 6px 16px -6px rgba(232,115,12,.6) !important }

/* ---------- 3.2 sub-abas (Pré-Pedido · Dashboard · Catálogo · Etiquetas · Retiradas) ---------- */
body.ppv-vn .ppv-subabas { align-items: flex-end !important; gap: 4px !important; padding: 12px 0 0 !important; margin: 0 16px; background: transparent !important; border-bottom: 1px solid var(--border, #e2e8f0) !important }
body.ppv-vn .ppv-subaba { height: 44px; padding: 0 16px !important; gap: 9px !important; border: none !important; border-radius: 11px 11px 0 0 !important; background: transparent !important; box-shadow: none !important;
  color: var(--portal-text-secondary, #475569) !important; font-size: 14.5px !important; font-weight: 500 !important }
body.ppv-vn .ppv-subaba::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 2px; border-radius: 3px 3px 0 0; background: color-mix(in srgb, var(--cor-aba) 35%, transparent); transition: background .15s, height .15s }
body.ppv-vn .ppv-subaba:hover:not(.ativa) { color: var(--portal-text, #0f172a) !important; background: color-mix(in srgb, var(--cor-aba) 6%, transparent) !important }
body.ppv-vn .ppv-subaba:hover::after { background: color-mix(in srgb, var(--cor-aba) 65%, transparent) }
body.ppv-vn .ppv-subaba.ativa { color: color-mix(in srgb, var(--cor-aba) 85%, #0f172a) !important; background: color-mix(in srgb, var(--cor-aba) 9%, transparent) !important }
body.ppv-vn .ppv-subaba.ativa::after { height: 3px; background: var(--cor-aba) }
body.ppv-vn .ppv-subaba-icone { width: 26px; height: 26px; border-radius: 8px; display: inline-grid; place-items: center; font-size: 12.5px !important; color: var(--cor-aba); background: color-mix(in srgb, var(--cor-aba) 11%, transparent) }
body.ppv-vn .ppv-subaba.ativa .ppv-subaba-icone { background: var(--cor-aba); color: #fefefe }
[data-theme="dark"] body.ppv-vn .ppv-subaba.ativa { color: color-mix(in srgb, var(--cor-aba) 45%, #ffffff) !important }
@media (max-width: 640px) {
  body.ppv-vn .ppv-subabas { margin: 0 12px }
  body.ppv-vn .ppv-subaba { padding: 0 8px !important; font-size: 13px !important }
  body.ppv-vn .ppv-subaba-icone { display: none }
}

/* ---------- 3.3 Cards · Lista · Relação (controle segmentado do POS) ---------- */
body.ppv-vn .ppv-visao-linha { padding: 10px 26px 0 !important }
body.ppv-vn .ppv-visao { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: var(--portal-bg-secondary, #eeeff0); border: 1px solid var(--portal-border, #f0f0f0) }
body.ppv-vn .ppv-visao-bt { height: 30px !important; padding: 0 12px !important; border: none !important; border-radius: 7px !important; background: transparent !important; color: #737373 !important; font-weight: 400 !important; font-size: 12.5px !important }
body.ppv-vn .ppv-visao-bt.on { background: var(--ppv-acao) !important; color: #fefefe !important }

/* ---------- 3.4 grupos de fase ---------- */
body.ppv-vn .ppv-cards-wrapper { padding: 18px 26px }
body.ppv-vn .ppv-cards-grid { gap: 14px }
body.ppv-vn .ppv-phase-group { margin: 0 -12px 2px; padding: 0 12px 24px; content-visibility: auto; contain-intrinsic-size: auto 640px }
body.ppv-vn .ppv-phase-group-name { font-size: 17px; font-weight: 500; color: var(--portal-text, #0f172a) }
body.ppv-vn .ppv-phase-group-count { font-weight: 500; font-size: 13px; padding: 3px 11px; border-radius: 99px; background: var(--portal-bg-secondary, #eeeff0); color: #737373 }
body.ppv-vn .ppv-phase-group-dot { width: 10px; height: 10px }
body.ppv-vn .ppv-phase-group-line { background: var(--border) }

/* ---------- 3.5 card do pedido (cópia do body.pos-vn .mini-card) ---------- */
body.ppv-vn .ppv-mini-card { --cor-tipo: var(--cor-aba); background: var(--surface) !important; border: 1px solid var(--border, #e2e8f0) !important; border-radius: 16px !important; padding: 16px 18px 14px !important; gap: 11px !important; box-shadow: none !important; transition: box-shadow .25s, transform .25s, border-color .25s !important }
body.ppv-vn .ppv-mini-card.rem { --cor-tipo: #b45309 }
body.ppv-vn .ppv-mini-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--cor-tipo) 35%, var(--border, #e2e8f0)) !important; box-shadow: 0 14px 28px -20px rgba(15,23,42,.55) !important }
body.ppv-vn .ppv-mini-card :not(i):not([class*="fa-"]) { font-weight: 400 !important }
body.ppv-vn .ppv-mini-card b, body.ppv-vn .ppv-mini-card strong { font-weight: 500 !important }
body.ppv-vn .ppv-mini-card i.fas, body.ppv-vn .ppv-mini-card i.fa-solid { font-weight: 900 !important }
body.ppv-vn .ppv-mini-card i.far, body.ppv-vn .ppv-mini-card i.fa-regular { font-weight: 400 !important }
body.ppv-vn .ppv-mini-card .capa-titulo { display: grid; grid-template-columns: 40px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 11px; row-gap: 3px; align-items: center; font-size: 15px !important; color: var(--portal-text, #0f172a) }
/* ícone de peça (no POS é o trator) — só enfeite */
body.ppv-vn .ppv-mini-card .capa-titulo::before { grid-row: 1 / 3; grid-column: 1; content: "\\f49e"; font-family: "Font Awesome 6 Free"; font-weight: 900 !important; width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: var(--cor-tipo); background: color-mix(in srgb, var(--cor-tipo) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--cor-tipo) 18%, transparent) }
body.ppv-vn .ppv-mini-card .capa-titulo > span:nth-of-type(1) { display: none }
body.ppv-vn .ppv-mini-card .capa-titulo > span:last-child { grid-column: 2; font-size: 16.5px; color: var(--portal-text, #0f172a); font-weight: 500 !important; line-height: 1.25 }
body.ppv-vn .ppv-mini-card .capa-titulo > b { grid-column: 2; justify-self: start; display: inline-flex; align-items: baseline; gap: 5px; font-size: 13.5px !important; line-height: 1.5; padding: 0 9px; border-radius: 7px; font-variant-numeric: tabular-nums; letter-spacing: .03em; color: var(--portal-text, #0f172a) !important; background: color-mix(in srgb, var(--cor-tipo) 8%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--cor-tipo) 20%, transparent) }
/* prefixo "PPV" (a remessa já vem escrita "REM 0005") */
body.ppv-vn .ppv-mini-card:not(.rem) .capa-titulo > b::before { content: "PPV"; font-size: 11px; letter-spacing: .06em; color: color-mix(in srgb, var(--cor-tipo) 75%, #0f172a) }
body.ppv-vn .ppv-mini-card .capa-fase > b { font-size: 23px !important; letter-spacing: -.01em; color: var(--portal-text, #0f172a) }
body.ppv-vn .ppv-mini-card .capa-fase > span { font-size: 12px !important; padding: 3px 11px !important }
body.ppv-vn .ppv-mini-card .capa-linha { font-size: 13.5px !important }
body.ppv-vn .ppv-mini-card .capa-linha > span:first-child { color: var(--portal-text-secondary, #475569) !important }
body.ppv-vn .ppv-mini-card .capa-texto { font-size: 13px !important; line-height: 1.4 !important; border-radius: 10px !important; padding: 0 6px !important; border: 6px solid var(--bg-soft, #f8fafc) !important; box-shadow: 0 0 0 1px var(--border, #eef2f7); color: var(--portal-text-secondary, #475569) !important }
[data-theme="dark"] body.ppv-vn .ppv-mini-card .capa-texto { border-color: var(--portal-bg-secondary, #262626) !important; background: var(--portal-bg-secondary, #262626) !important }
body.ppv-vn .ppv-mini-card .capa-rodape { border-top-color: var(--border, #f1f5f9) !important; padding-top: 9px !important }
body.ppv-vn .ppv-mini-card .capa-rodape > span:first-child { font-size: 12.5px !important }
body.ppv-vn .ppv-mini-card .capa-rodape .mc-icon-wrap > span { font-size: 10px !important }
body.ppv-vn .ppv-mini-card .capa-bol span { font-size: 10.5px !important }
body.ppv-vn .ppv-mini-card button { border-radius: 10px !important }

/* ---------- 3.6 Lista ---------- */
body.ppv-vn .ppv-list { gap: 8px }
body.ppv-vn .ppv-list-row { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 13px 18px }
body.ppv-vn .ppv-list-row:hover { background: var(--surface); border-color: color-mix(in srgb, var(--cor-aba) 35%, var(--border)); box-shadow: 0 12px 24px -20px rgba(15,23,42,.5) }
body.ppv-vn .ppv-list-titulo, body.ppv-vn .ppv-list-cliente { font-weight: 500 }
body.ppv-vn .ppv-list-lbl { text-transform: none; letter-spacing: 0; font-weight: 400; font-size: 12px; color: var(--portal-text-secondary, #475569) }
body.ppv-vn .ppv-list-v { font-weight: 400 }
body.ppv-vn .ppv-list-valor { font-weight: 500; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums }

/* ---------- 3.6 Relação (estilo escrito no elemento: troca por seletor de atributo) ---------- */
body.ppv-vn .ppv-rel :not(i):not([class*="fa-"]):is([style*="font-weight: 6"], [style*="font-weight: 7"], [style*="font-weight: 8"], [style*="font-weight: 9"]) { font-weight: 500 !important }
body.ppv-vn .ppv-rel [style*="uppercase"] { text-transform: none !important; letter-spacing: 0 !important }
body.ppv-vn .ppv-rel [style*="border-radius: 3px"] { border-radius: 10px !important }
body.ppv-vn .ppv-rel-tabela { border-radius: 16px !important; border-color: var(--border) !important }
body.ppv-vn .ppv-rel th { font-size: 13px !important; color: var(--portal-text-secondary, #475569) }
body.ppv-vn .ppv-rel td { font-variant-numeric: tabular-nums }
body.ppv-vn .ppv-rel [style*="border-left: 4px solid"] { border-left-width: 1px !important; border-radius: 14px !important }

/* =====================================================================
   3.7 PEDIDO ABERTO (drawer) — espelho do body.pos-vn .pos-osd
   O drawer vai por portal pro <body> (fora da página): os tokens ficam nele.
   ===================================================================== */
body.ppv-vn .ppv-drawer-overlay { --surface: var(--ppv-surface); --border: var(--ppv-border-light); --bg-soft: var(--ppv-primary-light); --primary: var(--ppv-acao) }
/* sem negrito pesado e sem CAIXA ALTA (pega também o estilo escrito no elemento) */
body.ppv-vn .ppv-drawer :is(b, strong, th, h1, h2, h3, h4, label, .ppv-card-title):not(i):not([class*="fa-"]) { font-weight: 500 !important }
body.ppv-vn .ppv-drawer :not(i):not([class*="fa-"]):is([style*="font-weight: 6"], [style*="font-weight: 7"], [style*="font-weight: 8"], [style*="font-weight: 9"]) { font-weight: 500 !important }
body.ppv-vn .ppv-drawer [style*="uppercase"], body.ppv-vn .ppv-drawer .ppv-rail-acoes-titulo { text-transform: none !important; letter-spacing: 0 !important }
body.ppv-vn .ppv-drawer i.fas, body.ppv-vn .ppv-drawer i.fa-solid { font-weight: 900 !important }

/* topo: título 21px, nº neutro, fase em pílula, Ocorrência e Fechar no padrão do POS */
body.ppv-vn .ppv-omie-topbar { background: var(--surface) !important; border-bottom-color: var(--border) !important; padding: 12px 22px !important }
body.ppv-vn .ppv-tp-titulo { font-size: 21px !important; color: var(--portal-text, #0f172a) !important }
body.ppv-vn .ppv-tp-num { color: var(--portal-text-secondary, #475569) !important; background: var(--portal-bg-secondary, #f1f5f9) !important; border-color: transparent !important; border-radius: 7px !important; font-variant-numeric: tabular-nums }
body.ppv-vn .ppv-tp-fase { border-radius: 999px !important; padding: 0 34px 0 14px !important; height: 36px; font-size: 13.5px !important; border: 1px solid var(--border) !important }
body.ppv-vn .ppv-tp-ocorr, body.ppv-vn .ppv-tp-fechar { height: 38px; padding: 0 14px !important; border-radius: 10px !important; border: 1px solid var(--border) !important; background: var(--surface) !important; color: var(--portal-text-secondary, #475569) !important; font-size: 14px !important }
body.ppv-vn .ppv-tp-ocorr:hover, body.ppv-vn .ppv-tp-fechar:hover { background: var(--portal-bg-secondary, #f1f5f9) !important; color: var(--portal-text, #0f172a) !important }

/* fundo e seções (.os-card) */
body.ppv-vn .ppv-drawer { background: var(--ppv-primary-light) }
body.ppv-vn .ppv-omie-head { border-radius: 16px !important; border-color: var(--border) !important; padding: 16px 18px !important; background: var(--surface) !important }
body.ppv-vn .ppv-card { background: var(--surface); border: 1px solid var(--border) !important; border-radius: 16px; padding: 18px 20px; box-shadow: none }
body.ppv-vn .ppv-card:hover { box-shadow: 0 12px 26px -22px rgba(15,23,42,.5) }
body.ppv-vn .ppv-card-title { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--portal-text, #0f172a); border-bottom-color: var(--border) }
body.ppv-vn .ppv-card-title > i { width: 32px; height: 32px; border-radius: 9px; display: inline-grid; place-items: center; font-size: 13.5px; color: var(--cor-aba) !important; background: color-mix(in srgb, var(--cor-aba) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--cor-aba) 16%, transparent) }
body.ppv-vn .ppv-drawer [style*="border-left: 3px solid"], body.ppv-vn .ppv-drawer [style*="border-left: 4px solid"], body.ppv-vn .ppv-drawer [style*="border-left: 5px solid"] { border-left-width: 1px !important; border-radius: 12px !important }
body.ppv-vn .ppv-drawer .os-omie-totais { border-radius: 12px !important; border-color: var(--border) !important }
body.ppv-vn .ppv-tabela-itens { border-radius: 12px !important; border-color: var(--border) !important }

/* campos: rótulo sem caixa alta, fundo branco, cantos 10, foco azul */
body.ppv-vn .ppv-drawer label { text-transform: none; letter-spacing: 0; font-size: 13px; color: var(--portal-text-secondary, #475569) }
body.ppv-vn .ppv-drawer :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea) { background-color: var(--surface) !important; border-color: var(--border) !important; border-radius: 10px }
body.ppv-vn .ppv-drawer :is(input, select, textarea):focus { border-color: var(--primary) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ppv-acao) 15%, transparent); outline: none }

/* abas internas (Itens da Venda · Departamentos · …) no padrão .os-tab: sublinhado azul */
body.ppv-vn .ppv-abas { border-bottom-color: var(--border) !important; gap: 4px !important }
body.ppv-vn .ppv-aba { background: transparent !important; border: none !important; border-bottom: 2px solid transparent !important; border-radius: 0 !important; padding: 10px 14px !important; font-size: 15px !important; color: var(--portal-text-secondary, #475569) !important }
body.ppv-vn .ppv-aba:hover { color: var(--portal-text, #0f172a) !important }
body.ppv-vn .ppv-aba.on { color: var(--cor-aba) !important; border-bottom: 3px solid var(--cor-aba) !important }

/* botões do card de itens: primário (Novo Item) no verde-petróleo do "Incluir serviço"; o resto branco com borda */
body.ppv-vn .ppv-bt-prim { border-radius: 10px !important; font-weight: 500 !important }
body.ppv-vn .ppv-bt-sec { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: 10px !important; color: var(--portal-text, #334155) !important; font-weight: 500 !important }
body.ppv-vn .ppv-bt-sec:disabled { color: #94a3b8 !important }
body.ppv-vn .ppv-drawer button:not(.ppv-rail-btn):not([class*="fa-"]) { border-radius: 10px }

/* coluna da direita (.os-rail-nova): Salvar no gradiente do POS; blocos brancos iguais */
body.ppv-vn .ppv-rail-nova { background: var(--portal-bg-secondary, #f6f8f9) !important }
body.ppv-vn .ppv-rail-nova .ppv-rail-btn.primary { border-radius: 14px; font-weight: 500 !important }
body.ppv-vn .ppv-rail-nova :is(.ppv-rail-cartao, .ppv-rail-acoes, .ppv-rail-perigo) { background: var(--surface) !important; border: 1px solid var(--border) !important; border-radius: 16px !important; box-shadow: none !important }
body.ppv-vn .ppv-rail-cabeca { color: var(--portal-text, #0f172a); font-size: 13px !important }
body.ppv-vn .ppv-rail-acoes-titulo { font-size: 13px !important; color: var(--portal-text-secondary, #475569) !important }
body.ppv-vn .ppv-rail-nova .ppv-rail-acoes .ppv-rail-btn, body.ppv-vn .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn { font-weight: 400 !important; font-size: 14px }
body.ppv-vn .ppv-rail-nova .ppv-rail-acoes .ppv-rail-btn i { border-radius: 9px; color: var(--cor-aba) !important; background: color-mix(in srgb, var(--cor-aba) 9%, transparent) !important }
body.ppv-vn .ppv-rail-nova .ppv-rail-acoes .ppv-rail-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--cor-aba) 6%, transparent) !important }
[data-theme="dark"] body.ppv-vn .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn { color: var(--portal-red-fg, #f87171) !important }
[data-theme="dark"] body.ppv-vn .ppv-rail-nova .ppv-rail-perigo .ppv-rail-btn i { background: rgb(248 113 113 / .15) !important; color: var(--portal-red-fg, #f87171) !important }

/* =====================================================================
   3.8 NOVO LANÇAMENTO — modo "criando" da OS: cartões brancos, cantos 16, sem negrito pesado
   ===================================================================== */
body.ppv-vn .ppv-vn-form { padding: 18px 26px !important }
body.ppv-vn .ppv-form-page { height: auto; min-height: calc(100vh - 170px) }
body.ppv-vn .ppv-form-title { font-size: 21px; font-weight: 500; color: var(--portal-text, #0f172a) }
body.ppv-vn .ppv-form-back { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); width: 40px; height: 40px }
body.ppv-vn .ppv-form-left { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px !important }
body.ppv-vn .ppv-form-section-title { font-size: 16px !important; font-weight: 500 !important; text-transform: none !important; letter-spacing: 0 !important; color: var(--portal-text, #0f172a) !important; display: flex; align-items: center; gap: 10px }
body.ppv-vn .ppv-form-section-title > i { width: 32px; height: 32px; border-radius: 9px; display: inline-grid; place-items: center; font-size: 13.5px; color: var(--cor-aba) !important; background: color-mix(in srgb, var(--cor-aba) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--cor-aba) 16%, transparent) }
body.ppv-vn .ppv-form-label { font-size: 13px; font-weight: 500; color: var(--portal-text-secondary, #475569) }
body.ppv-vn .ppv-form-required { font-weight: 500 }
body.ppv-vn .ppv-form-divider { border-color: var(--border) !important; background: var(--border) !important }
body.ppv-vn .ppv-form-left :is(input, select, textarea), body.ppv-vn .ppv-form-picker { border: 1px solid var(--border) !important; border-radius: 12px !important; background: var(--surface) !important }
body.ppv-vn .ppv-form-left :is(input, select, textarea):focus, body.ppv-vn .ppv-form-picker:hover { border-color: var(--ppv-acao) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ppv-acao) 15%, transparent) }
body.ppv-vn .ppv-form-picker-name { font-weight: 500 }
body.ppv-vn .ppv-form-btn-primary, body.ppv-vn .ppv-form-btn-submit, body.ppv-vn .ppv-form-btn-secondary { border-radius: 11px !important; font-weight: 500 !important }
body.ppv-vn .ppv-vn-form button[style*="font-weight"] { font-weight: 500 !important }
body.ppv-vn .ppv-vn-form button[style*="border-radius"] { border-radius: 11px !important }
body.ppv-vn .ppv-form-cart { border: 1px solid var(--border) !important; border-radius: 16px !important; overflow: hidden; box-shadow: none !important; background: var(--surface) }
body.ppv-vn .ppv-form-cart-header { font-size: 16px; font-weight: 500 !important; border-bottom-color: var(--border) !important }
body.ppv-vn .ppv-form-cart-badge { border-radius: 999px !important; font-weight: 500 !important }
body.ppv-vn .ppv-form-cart-item { border-radius: 12px !important; border-color: var(--border) !important }
body.ppv-vn .ppv-form-cart-item-code, body.ppv-vn .ppv-form-cart-item-subtotal { font-weight: 500 !important }
body.ppv-vn .ppv-form-cart-footer { border-top-color: var(--border) !important }
body.ppv-vn .ppv-form-cart-total { text-transform: none !important; letter-spacing: 0 !important; font-weight: 500 !important; font-size: 14px }
body.ppv-vn .ppv-form-cart-total-value { font-weight: 500 !important }
body.ppv-vn .ppv-vn-form [style*="uppercase"] { text-transform: none !important; letter-spacing: 0 !important }

/* =====================================================================
   DEMAIS ABAS (Dashboard · Catálogo · Etiquetas · Retiradas) — mesma forma, cores de sempre
   (o .pecas-skin continua dando o laranja; aqui só tiramos o "tudo quadrado", o negrito e a caixa alta)
   ===================================================================== */
body.ppv-vn .ppv-vn-aba :not(i):not([class*="fa-"]):is(b, strong, th, h1, h2, h3, h4, label) { font-weight: 500 !important }
body.ppv-vn .ppv-vn-aba :not(i):not([class*="fa-"]):is([style*="font-weight: 6"], [style*="font-weight: 7"], [style*="font-weight: 8"], [style*="font-weight: 9"], [class*="font-semibold"], [class*="font-bold"], [class*="font-extrabold"], [class*="font-black"]) { font-weight: 500 !important }
body.ppv-vn .ppv-vn-aba [style*="uppercase"], body.ppv-vn .ppv-vn-aba [class~="uppercase"] { text-transform: none !important; letter-spacing: 0 !important }
body.ppv-vn .ppv-vn-aba i.fas, body.ppv-vn .ppv-vn-aba i.fa-solid { font-weight: 900 !important }
/* cantos: cartões 14, botões e campos 10, pílulas redondas (vence o "tudo quadrado" do .pecas-skin) */
body.ppv-vn .ppv-vn-aba :is([style*="border-radius"], [class*="rounded"]) { border-radius: 14px !important }
body.ppv-vn .ppv-vn-aba :is(button, input, select, textarea, a)[style*="border-radius"], body.ppv-vn .ppv-vn-aba :is(button, input, select, textarea) { border-radius: 10px !important }
body.ppv-vn .ppv-vn-aba :is([style*="border-radius: 999"], [style*="border-radius: 99px"], [style*="border-radius: 50%"], [class*="rounded-full"]) { border-radius: 999px !important }
/* faixa colorida na lateral esquerda vira borda normal (como o POS faz) */
body.ppv-vn .ppv-vn-aba :is([style*="border-left: 3px solid"], [style*="border-left: 4px solid"], [style*="border-left: 5px solid"]) { border-left-width: 1px !important }
/* as sub-abas e a faixa de módulos não entram na regra de cantos acima */
body.ppv-vn .ppv-vn-aba .ppv-subaba { border-radius: 11px 11px 0 0 !important }
body.ppv-vn .ppv-vn-aba .ppv-subaba-icone { border-radius: 8px !important }
body.ppv-vn .pecas-skin .ppv-topbar-nav-btn { border-radius: 12px 12px 0 0 !important }
`;
