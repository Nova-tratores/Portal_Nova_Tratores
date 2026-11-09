// Estilo POS NewPortal (docs/estilo-pos-newportal.md) no Marketing & Eventos inteiro
// (José, 06/11/2026). Mesmo jeito do Opa (components/opa/visualOpa.ts): as telas usam
// estilo inline, então esta camada (sob .mkt-vn, montada em app/(portal)/marketing/layout.tsx)
// tira negrito, caixa alta e faixa lateral de todas de uma vez. As peças comuns
// (Painel, Kpi, Selo, Modal…) já nascem no estilo novo em ui.tsx.

const PESADO = [600, 700, 800, 900].map((p) => `.mkt-vn [style*="font-weight: ${p}"]:not(i):not([class*="fa-"])`).join(',\n')

export const ESTILO_MKT_VN = `
.mkt-vn { color: var(--portal-text, #0f172a) }
/* 1. sem negrito: no máximo 500 (ícone do Font Awesome precisa do 900) */
${PESADO},
.mkt-vn b, .mkt-vn strong, .mkt-vn h1, .mkt-vn h2, .mkt-vn h3, .mkt-vn th { font-weight: 500 !important }
/* 2. sem caixa alta */
.mkt-vn [style*="text-transform: uppercase"] { text-transform: none !important; letter-spacing: 0 !important }
/* 3. sem faixa colorida do lado do cartão */
.mkt-vn [style*="border-left: 4px"], .mkt-vn [style*="border-left: 3px"] { border-left-width: 1px !important; border-left-color: var(--portal-border, #e2e8f0) !important }
/* 4. cantos: caixinhas 10, cartões 16 */
.mkt-vn [style*="border-radius: 3px"], .mkt-vn [style*="border-radius: 4px"] { border-radius: 10px !important }
.mkt-vn [style*="border-radius: 3px 3px 0px 0px"], .mkt-vn [style*="border-radius: 4px 4px 0px 0px"] { border-radius: 10px 10px 0 0 !important }
.mkt-vn input:not([type="checkbox"]):not([type="radio"]), .mkt-vn select, .mkt-vn textarea { border-radius: 10px }
/* 5. o mesmo hover dos cartões do POS */
.mkt-vn .mkt-card { transition: box-shadow .25s, transform .25s, border-color .25s }
.mkt-vn a.mkt-card:hover, .mkt-vn .mkt-card-hover:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55);
  border-color: color-mix(in srgb, var(--c, #DB2777) 35%, var(--portal-border, #e2e8f0)) !important }
/* tabelas: cabeçalho claro, sem caixa alta */
.mkt-vn th { color: var(--portal-text-muted, #475569); font-size: 12.5px }
/* abas da ficha: rolam de lado no celular em vez de virar 4 linhas */
@media (max-width: 768px) {
  .mkt-vn .mkt-abas { flex-wrap: nowrap !important; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none }
  .mkt-vn .mkt-abas > * { flex: none }
}
/* celular (auditoria 06/11/2026): "R$ 38.534,00" não cabia no indicador e a página rolava de lado (396 px a 360) */
@media (max-width: 480px) {
  .mkt-vn .mkt-kpi { min-width: 0 !important; flex-basis: calc(50% - 6px) !important; padding: 12px !important; gap: 9px !important }
  .mkt-vn .mkt-kpi-v { font-size: 18px !important; white-space: normal !important; overflow-wrap: anywhere }
  .mkt-vn select { min-width: 0; max-width: 100% }
}
`
