'use client';
// Visual novo das Requisições = "Estilo POS NewPortal" (docs/estilo-pos-newportal.md):
// cartão branco cantos 16, sem negrito (máx. 500), sem CAIXA ALTA, texto escuro,
// ícone em quadradinho colorido, sem faixa lateral, valor grande, R$ no formato BR.
// Tudo sob `.req-vn` (a página põe a classe no embrulho).
import React from 'react';

export function IconeQuadrado({ icone, cor, tamanho = 40 }: { icone: string; cor: string; tamanho?: number }) {
  const r = tamanho >= 40 ? 11 : 9;
  return (
    <span className="req-ico" style={{
      width: tamanho, height: tamanho, borderRadius: r, fontSize: tamanho >= 40 ? 16 : 13,
      color: cor, background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`,
      border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)`,
    }}>
      <i className={`fa-solid ${icone}`} />
    </span>
  );
}

export const ESTILO_REQ_VN = `
.req-vn { --rq-txt: var(--portal-text, #0f172a); --rq-sec: var(--portal-text-secondary, #475569); --rq-apag: var(--portal-text-muted, #64748b); --rq-borda: var(--border, #e2e8f0); }
.req-vn .req-ico { display: inline-grid; place-items: center; flex: none; }
.req-vn .req-ico i { font-weight: 900 }

/* ---------- abas coloridas (cada uma com a sua cor, mesmo sem estar escolhida) ---------- */
.req-vn .rq-abas { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none }
.req-vn .rq-aba { display: inline-flex; align-items: center; gap: 9px; padding: 8px 14px 9px; border: 0; border-bottom: 2px solid color-mix(in srgb, var(--c) 35%, transparent); background: transparent; color: var(--rq-txt); font: inherit; font-size: 14.5px; font-weight: 400; cursor: pointer; border-radius: 12px 12px 0 0; white-space: nowrap; transition: background .2s }
.req-vn .rq-aba:hover { background: color-mix(in srgb, var(--c) 6%, transparent) }
.req-vn .rq-aba .rq-aba-ico { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 12px; color: var(--c); background: color-mix(in srgb, var(--c) 11%, var(--surface, #fefefe)) }
.req-vn .rq-aba .rq-aba-conta { font-size: 12px; padding: 1px 8px; border-radius: 99px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, var(--surface, #fefefe)) }
.req-vn .rq-aba.on { background: color-mix(in srgb, var(--c) 9%, var(--surface, #fefefe)); border-bottom: 3px solid var(--c); font-weight: 500 }
.req-vn .rq-aba.on .rq-aba-ico, .req-vn .rq-aba.on .rq-aba-conta { background: var(--c); color: #fefefe }

/* ---------- cartões genéricos ---------- */
.req-vn .rq-card { background: var(--surface, #fefefe); border: 1px solid var(--rq-borda); border-radius: 16px; padding: 16px 18px 14px; box-shadow: none; transition: box-shadow .25s, transform .25s, border-color .25s; color: var(--rq-txt) }
.req-vn .rq-card.clicavel { cursor: pointer }
.req-vn .rq-card.clicavel:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c, #2563eb) 35%, var(--rq-borda)) }
.req-vn .rq-num { font-size: 22px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: var(--rq-txt) }
.req-vn .rq-rot { font-size: 12.5px; color: var(--rq-sec) }
.req-vn .rq-pilula { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 2px 10px; border-radius: 99px; color: var(--c); background: color-mix(in srgb, var(--c) 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); white-space: nowrap }
.req-vn .rq-entra { animation: rqEntra .45s cubic-bezier(.16,1,.3,1) both }
@keyframes rqEntra { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.req-vn .rq-pulsa { animation: rqPulsa 2.4s ease-in-out infinite }
@keyframes rqPulsa { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c, #2563EB) 0%, transparent) } 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--c, #2563EB) 22%, transparent) } }
.req-vn .rq-pilula.rq-pulsa { animation: rqPulsaPilula 1.8s ease-in-out infinite }
@keyframes rqPulsaPilula { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.06) } }
@media (prefers-reduced-motion: reduce) { .req-vn .rq-entra, .req-vn .rq-barra > span, .req-vn .rq-pulsa { animation: none !important; transition: none !important } }

/* ---------- cartão da requisição no quadro ---------- */
.req-vn .rq-req { position: relative; margin-bottom: 12px }
.req-vn .rq-req-topo { display: grid; grid-template-columns: 40px minmax(0,1fr) auto; column-gap: 11px; align-items: center }
.req-vn .rq-req-num { display: inline-flex; align-items: baseline; gap: 5px; font-size: 13.5px; padding: 0 9px; border-radius: 7px; font-variant-numeric: tabular-nums; letter-spacing: .03em; color: var(--rq-txt); background: color-mix(in srgb, var(--c) 8%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); justify-self: start; line-height: 1.6 }
.req-vn .rq-req-num small { font-size: 11px; letter-spacing: .06em; color: color-mix(in srgb, var(--c) 75%, #0f172a) }
.req-vn .rq-req-tipo { font-size: 12.5px; color: var(--rq-sec); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.req-vn .rq-req-acoes { display: flex; gap: 4px }
.req-vn .rq-req-acoes button { width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--rq-borda); background: var(--surface, #fefefe); color: var(--rq-apag); display: grid; place-items: center; cursor: pointer; transition: color .2s, border-color .2s }
.req-vn .rq-req-acoes button:hover { color: var(--c); border-color: color-mix(in srgb, var(--c) 40%, var(--rq-borda)) }
.req-vn .rq-req-titulo { font-size: 15.5px; font-weight: 500; line-height: 1.3; margin: 11px 0 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
.req-vn .rq-req-sub { font-size: 13px; color: var(--rq-sec); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.req-vn .rq-req-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12.5px; color: var(--rq-sec); margin-top: 9px }
.req-vn .rq-req-meta i { color: var(--rq-apag); margin-right: 5px; font-size: 11px }
.req-vn .rq-req-selos { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px }
.req-vn .rq-req-rodape { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--rq-borda) }
.req-vn .rq-anexo { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 7px; border-radius: 7px; color: var(--rq-apag); background: var(--portal-bg-secondary, #f1f5f9) }
.req-vn .rq-anexo.on { color: #15803d; background: color-mix(in srgb, #16a34a 10%, var(--surface, #fefefe)) }

/* ---------- colunas do quadro ---------- */
.req-vn .rq-col-cab { display: flex; align-items: center; gap: 10px; padding: 12px 14px; background: var(--surface, #fefefe); border: 1px solid var(--rq-borda); border-radius: 16px; margin-bottom: 10px }
.req-vn .rq-col-nome { font-size: 15px; font-weight: 500; color: var(--rq-txt) }
.req-vn .rq-col-sub { font-size: 12.5px; color: var(--rq-sec); font-variant-numeric: tabular-nums }

/* ---------- barras do painel ---------- */
.req-vn .rq-barra { position: relative; height: 8px; border-radius: 99px; background: var(--portal-bg-secondary, #eef2f6); overflow: hidden }
.req-vn .rq-barra > span { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: var(--c); transition: width .7s cubic-bezier(.16,1,.3,1) }
.req-vn .rq-linha-barra { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 7px 8px; border-radius: 10px; cursor: pointer; transition: background .15s }
.req-vn .rq-linha-barra:hover { background: color-mix(in srgb, var(--c) 6%, transparent) }
.req-vn .rq-linha-barra .rq-barra { grid-column: 1 / -1 }

/* ---------- campos e botões dentro do módulo ---------- */
.req-vn .rq-btn { display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 14px; border-radius: 11px; border: 1px solid var(--rq-borda); background: var(--surface, #fefefe); color: var(--rq-txt); font: inherit; font-size: 14px; cursor: pointer; transition: border-color .2s, background .2s }
.req-vn .rq-btn:hover { border-color: color-mix(in srgb, var(--c, #EA580C) 45%, var(--rq-borda)) }
.req-vn .rq-btn.cheio { background: var(--c, #EA580C); border-color: var(--c, #EA580C); color: #fefefe }
`;
