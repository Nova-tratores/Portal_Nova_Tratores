"use client";
// "Visual novo" do POS = o estilo dos cartões do Faturamento por período (Janela Mecânicos) aplicado no POS
// inteiro, pra ver como fica (José, 21/10/2026: "sabe o estilo daqueles cartões? coloca no POS inteiro pra gente
// ver como vai ficar"). Liga/desliga no menu circular do cabeçalho; a escolha fica no navegador. Tudo por CSS sob
// `body.pos-vn` — desligado, o POS fica exatamente como era.
import { useEffect, useSyncExternalStore } from "react";

const CHAVE = "pos-visual-novo";
const EVENTO = "pos-visual-novo-mudou";

// visual novo fixo: o botão de voltar ao antigo saiu (José, 29/10/2026); quem tinha "0" salvo também passa ao novo
function ler(): boolean {
  return true;
}
function assinar(f: () => void) {
  window.addEventListener(EVENTO, f);
  window.addEventListener("storage", f);
  return () => { window.removeEventListener(EVENTO, f); window.removeEventListener("storage", f); };
}
export function definirVisualNovo(on: boolean) {
  try { localStorage.setItem(CHAVE, on ? "1" : "0"); } catch { /* sem storage: vale só até recarregar */ }
  window.dispatchEvent(new Event(EVENTO));
}

/** Liga a classe no <body> enquanto o POS estiver montado. */
export function usePosVisualNovo(): boolean {
  const on = useSyncExternalStore(assinar, ler, () => true);
  useEffect(() => {
    document.body.classList.toggle("pos-vn", on);
    return () => document.body.classList.remove("pos-vn");
  }, [on]);
  return on;
}

// Cores por var do tema (claro/escuro); texto escuro, sem negrito, cantos 16, ícone em quadradinho.
export const ESTILO_POS_VN = `
/* ---------- cartões das OS ---------- */
body.pos-vn .cards-wrapper { padding: 18px 26px }
body.pos-vn .cards-grid { gap: 14px }
body.pos-vn .mini-card { background: var(--surface) !important; border: 1px solid var(--border, #e2e8f0) !important; border-radius: 16px !important; padding: 16px 18px 14px !important; gap: 11px !important; box-shadow: none !important; transition: box-shadow .25s, transform .25s, border-color .25s !important }
body.pos-vn .mini-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--cor-tipo, #2563eb) 35%, var(--border, #e2e8f0)) !important; box-shadow: 0 14px 28px -20px rgba(15,23,42,.55) !important }
/* tira o negrito do texto, mas NÃO dos ícones (o Font Awesome sólido precisa do peso 900 — sem ele vira quadradinho) */
body.pos-vn .mini-card :not(i):not([class*="fa-"]) { font-weight: 400 !important }
body.pos-vn .mini-card b, body.pos-vn .mini-card strong { font-weight: 500 !important }
body.pos-vn .mini-card i.fas, body.pos-vn .mini-card i.fa-solid { font-weight: 900 !important }
body.pos-vn .mini-card i.far, body.pos-vn .mini-card i.fa-regular { font-weight: 400 !important }
/* título: ícone à esquerda; em cima o nº da OS numa etiqueta "OS 0846", embaixo o cliente (José, 21/10: "melhora o número da OS") */
body.pos-vn .mini-card .capa-titulo { display: grid; grid-template-columns: 40px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 11px; row-gap: 3px; align-items: center; font-size: 15px !important; color: var(--portal-text, #0f172a) }
body.pos-vn .mini-card .capa-titulo::before { grid-row: 1 / 3; grid-column: 1; content: "\\f722"; font-family: "Font Awesome 6 Free"; font-weight: 900 !important; flex: none; width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: var(--cor-tipo, #2563eb); background: color-mix(in srgb, var(--cor-tipo, #2563eb) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--cor-tipo, #2563eb) 18%, transparent) }
body.pos-vn .mini-card .capa-titulo > span:last-child { font-size: 16.5px; color: var(--portal-text, #0f172a); font-weight: 500 !important; line-height: 1.25 }
body.pos-vn .mini-card .capa-titulo > span:nth-of-type(1) { display: none }
body.pos-vn .mini-card .capa-titulo > b { grid-column: 2; justify-self: start; display: inline-flex; align-items: baseline; gap: 5px; font-size: 13.5px !important; line-height: 1.5; padding: 0 9px; border-radius: 7px; font-variant-numeric: tabular-nums; letter-spacing: .03em; color: var(--portal-text, #0f172a) !important; background: color-mix(in srgb, var(--cor-tipo, #2563eb) 8%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--cor-tipo, #2563eb) 20%, transparent) }
body.pos-vn .mini-card .capa-titulo > b::before { content: "OS"; font-size: 11px; letter-spacing: .06em; color: color-mix(in srgb, var(--cor-tipo, #2563eb) 75%, #0f172a) }
body.pos-vn .mini-card .capa-titulo > span:last-child { grid-column: 2 }
body.pos-vn .mini-card .capa-fase > b { font-size: 23px !important; letter-spacing: -.01em; color: var(--portal-text, #0f172a) }
body.pos-vn .mini-card .capa-fase > span { font-size: 12px !important; padding: 3px 11px !important }
body.pos-vn .mini-card .capa-linha { font-size: 13.5px !important }
body.pos-vn .mini-card .capa-linha > span:first-child { color: var(--portal-text-secondary, #475569) !important }
/* a margem vai na BORDA (da cor do fundo) e não no padding: o padding deixava aparecer meia 3ª linha embaixo do corte de 2 linhas */
body.pos-vn .mini-card .capa-texto { font-size: 13px !important; line-height: 1.4 !important; border-radius: 10px !important; padding: 0 6px !important; border: 6px solid var(--bg-soft, #f8fafc) !important; box-shadow: 0 0 0 1px var(--border, #eef2f7); color: var(--portal-text-secondary, #475569) !important }
body.pos-vn .mini-card .capa-rodape { border-top-color: var(--border, #f1f5f9) !important; padding-top: 9px !important }
body.pos-vn .mini-card .capa-rodape > span:first-child { font-size: 12.5px !important }
body.pos-vn .mini-card .capa-rodape .mc-icon-wrap > span { font-size: 10px !important }
body.pos-vn .mini-card .capa-bol span { font-size: 10.5px !important }
body.pos-vn .mini-card button { border-radius: 10px !important }
body.pos-vn .mini-card-atraso { border-radius: 10px !important; font-size: 12.5px !important }

/* ---------- fases e abas ---------- */
body.pos-vn .phase-group { margin-bottom: 26px }
body.pos-vn .phase-group-name { font-size: 17px; font-weight: 500; color: var(--portal-text, #0f172a) }
body.pos-vn .phase-group-count { font-weight: 500; font-size: 13px; padding: 3px 11px; border-radius: 99px; background: var(--portal-bg-secondary, #eef2f6); color: var(--portal-text-secondary, #475569) }
body.pos-vn .phase-group-dot { width: 10px; height: 10px }
body.pos-vn .pos-aba-rotulo { font-weight: 500; font-size: 14.5px }
body.pos-vn .pos-aba-conta { font-weight: 500 }

/* ---------- janela da OS (José, 21/10/2026: "muda dentro de cada card também") ---------- */
/* sem negrito e sem CAIXA ALTA: pega também o que vem com estilo escrito no próprio elemento (o React grava sem espaço) */
body.pos-vn .pos-osd :is(b, strong, th, h1, h2, h3, h4, label, .os-header-title, .os-tab, .os-summary-total, .os-summary-name):not(i):not([class*="fa-"]) { font-weight: 500 !important }
body.pos-vn .pos-osd :not(i):not([class*="fa-"]):is([style*="font-weight:6"], [style*="font-weight:7"], [style*="font-weight:8"], [style*="font-weight:9"], [style*="font-weight: 6"], [style*="font-weight: 7"], [style*="font-weight: 8"], [style*="font-weight: 9"]) { font-weight: 500 !important }
body.pos-vn .pos-osd [style*="uppercase"], body.pos-vn .pos-osd .os-rail-acoes-titulo { text-transform: none !important; letter-spacing: 0 !important }
body.pos-vn .pos-osd i.fas, body.pos-vn .pos-osd i.fa-solid { font-weight: 900 !important }
body.pos-vn .pos-osd .os-header-title { font-size: 21px; color: var(--portal-text, #0f172a) }
body.pos-vn .pos-osd .os-header select { border-radius: 999px !important; padding: 6px 14px !important; font-size: 13px !important; text-transform: none !important; letter-spacing: 0 !important }

/* faixa colorida do lado esquerdo sai (padrão de telas) — o bloco fica com a borda normal e cantos 14 */
body.pos-vn .pos-osd [style*="border-left:5px solid"], body.pos-vn .pos-osd [style*="border-left: 5px solid"] { border: 1px solid var(--border, #e2e8f0) !important; background: var(--surface) !important; border-radius: 14px !important }
body.pos-vn .pos-osd [style*="border-left:3px solid"], body.pos-vn .pos-osd [style*="border-left: 3px solid"], body.pos-vn .pos-osd [style*="border-left:4px solid"], body.pos-vn .pos-osd [style*="border-left: 4px solid"] { border-left-width: 0 !important; border-radius: 12px !important }

/* seções */
body.pos-vn .os-card { background: var(--surface); border: 1px solid var(--border, #e2e8f0) !important; border-radius: 16px; padding: 18px 20px; box-shadow: none }
body.pos-vn .os-card:hover { box-shadow: 0 12px 26px -22px rgba(15,23,42,.5) }
body.pos-vn .os-card-title { text-transform: none; letter-spacing: 0; font-size: 16px; color: var(--portal-text, #0f172a); border-bottom-color: var(--border, #f1f5f9) }
body.pos-vn .os-card-title > i { width: 32px; height: 32px; border-radius: 9px; display: inline-grid; place-items: center; font-size: 13.5px; color: #2563eb; background: color-mix(in srgb, #2563eb 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #2563eb 16%, transparent) }
body.pos-vn .os-drawer label, body.pos-vn .pos-osd label { text-transform: none; letter-spacing: 0; font-size: 13px; color: var(--portal-text-secondary, #475569) }
body.pos-vn .pos-osd input, body.pos-vn .pos-osd select, body.pos-vn .pos-osd textarea { border-radius: 10px }
body.pos-vn .pos-osd .os-tab { font-size: 15px }
body.pos-vn .pos-osd button:not(.os-rail-btn):not([class*="fa-"]) { border-radius: 10px }

/* coluna da direita: cada bloco vira um cartão branco igual */
body.pos-vn .os-rail-nova > div[style*="border"], body.pos-vn .os-rail-nova .os-rail-acoes, body.pos-vn .os-rail-nova .os-rail-perigo { background: var(--surface) !important; border: 1px solid var(--border, #e2e8f0) !important; border-radius: 16px !important; box-shadow: none !important }
body.pos-vn .os-rail-nova .os-rail-btn.primary { border-radius: 14px; font-weight: 500 !important }
body.pos-vn .os-rail-nova .os-rail-acoes .os-rail-btn, body.pos-vn .os-rail-nova .os-rail-perigo .os-rail-btn { font-weight: 400 !important; font-size: 14px }
body.pos-vn .os-rail-nova .os-rail-acoes .os-rail-btn i, body.pos-vn .os-rail-nova .os-rail-perigo .os-rail-btn i { border-radius: 9px }

/* campos: fundo branco (o bege some), borda fina */
body.pos-vn .pos-osd :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea) { background-color: var(--surface) !important; border-color: var(--border, #e2e8f0) !important; border-radius: 10px }

/* ---------- Nova OS (José, 21/10/2026: "faltou o estilo aqui") ---------- */
body.pos-vn .pos-osd.criando .os-body { background: none }
body.pos-vn .pos-osd.criando :is(.os-drawer, .os-drawer input, .os-drawer select, .os-drawer textarea, .os-drawer button) { font-family: inherit !important }
body.pos-vn .pos-osd.criando .os-header-title { font-size: 21px; font-weight: 500 !important; letter-spacing: 0 }
body.pos-vn .pos-osd.criando .os-card { box-shadow: none }
body.pos-vn .pos-osd.criando .os-card-title { font-size: 16px; font-weight: 500 !important; letter-spacing: 0; display: flex; align-items: center; gap: 10px }
body.pos-vn .pos-osd .osc-num { font-weight: 500 !important; background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text-secondary, #475569); border-color: transparent }
/* faixa dos passos: cartão branco, título escuro, barra azul fina, passos em chips com ícone em quadradinho */
body.pos-vn .pos-osd .osc-passos { background: var(--surface) !important; color: var(--portal-text, #0f172a) !important; border: 1px solid var(--border, #e2e8f0); box-shadow: 0 10px 24px -22px rgba(15,23,42,.6) !important; padding: 16px 18px; top: -20px }
body.pos-vn .pos-osd .osc-passos-titulo { font-size: 17px; font-weight: 500 !important; gap: 10px }
body.pos-vn .pos-osd .osc-passos-titulo i { width: 32px; height: 32px; border-radius: 9px; display: inline-grid; place-items: center; font-size: 13.5px; color: #0369A1; background: color-mix(in srgb, #0369A1 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #0369A1 16%, transparent) }
body.pos-vn .pos-osd .osc-passos-conta { font-weight: 500 !important; font-size: 13px; color: #0369A1; background: color-mix(in srgb, #0369A1 9%, var(--surface, #fefefe)); padding: 4px 12px }
body.pos-vn .pos-osd .osc-barra { height: 5px; background: var(--portal-bg-secondary, #eef2f6) }
body.pos-vn .pos-osd .osc-barra > div { background: linear-gradient(90deg, #38bdf8, #0369a1) }
body.pos-vn .pos-osd .osc-passo { border: 1px solid var(--border, #e2e8f0); background: var(--surface); color: var(--portal-text, #0f172a); font-weight: 400 !important; font-size: 14px; padding: 8px 12px; border-radius: 12px }
body.pos-vn .pos-osd .osc-passo:hover { background: var(--surface); border-color: #93c5fd }
body.pos-vn .pos-osd .osc-passo-bola { width: 30px; height: 30px; border-radius: 9px; color: #0369A1; background: color-mix(in srgb, #0369A1 9%, var(--surface, #fefefe)) }
body.pos-vn .pos-osd .osc-passo.ok { color: #15803d; border-color: #bbf7d0; background: color-mix(in srgb, #16a34a 6%, var(--surface, #fefefe)) }
body.pos-vn .pos-osd .osc-passo.ok .osc-passo-bola { background: #16a34a; color: #fefefe }
/* "Já quer lançar?" */
body.pos-vn .pos-osd .osc-extras { border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 12px 16px }
body.pos-vn .pos-osd .osc-extras-titulo { font-weight: 500 !important; font-size: 14.5px }
body.pos-vn .pos-osd .osc-extra { border: 1px solid var(--border, #e2e8f0); border-radius: 11px; font-weight: 400 !important; font-size: 14px }
body.pos-vn .pos-osd .osc-extra i { color: #0369A1 }
body.pos-vn .pos-osd .osc-extra:hover { border-color: #93c5fd }
body.pos-vn .pos-osd .osc-extra.on { border-color: #0369A1; background: color-mix(in srgb, #0369A1 8%, var(--surface, #fefefe)) }
body.pos-vn .pos-osd .osc-btn { font-weight: 500 !important; border-radius: 11px }
body.pos-vn .pos-osd .osc-toggle { border-width: 1px; border-radius: 14px }
body.pos-vn .pos-osd .osc-peca { border-radius: 12px } body.pos-vn .pos-osd :is(.osc-peca-cod, .osc-peca-valor) { font-weight: 500 !important }
`;
