// Estilo POS NewPortal (docs/estilo-pos-newportal.md) aplicado ao Financeiro inteiro (José, 29/10/2026),
// no mesmo molde do Opa (components/opa/visualOpa.ts): as telas do Financeiro usam estilo inline e esta
// camada (sob .fin-vn, montada em app/(portal)/financeiro/layout.js) tira negrito, caixa alta e faixa
// lateral de todas de uma vez, sem mexer em cada componente.
// O atributo style chega de dois jeitos: do servidor ("font-weight:700") e do navegador ("font-weight: 700").

const ambos = (prop: string, valor: string) => [`[style*="${prop}:${valor}"]`, `[style*="${prop}: ${valor}"]`]
const sel = (lista: string[], extra = '') => lista.map((s) => `.fin-vn ${s}${extra}`).join(',\n')

const PESADO = sel(['600', '700', '800', '900', 'bold'].flatMap((p) => ambos('font-weight', p)), ':not(i):not([class*="fa-"]):not(svg)')
const CAIXA_ALTA = sel(ambos('text-transform', 'uppercase'))
const FAIXA = sel(['3px', '4px', '5px', '6px'].flatMap((w) => ambos('border-left', w)))
const CANTOS = sel(['12px', '14px', '18px', '20px'].flatMap((r) => ambos('border-radius', r)))
// cabeçalho verde das colunas (#c5e29f) e os tons de vencido/sem boleto
const VERDE = sel([...ambos('background', '#c5e29f'), ...ambos('background', 'rgb(197, 226, 159)')])

export const ESTILO_FINANCEIRO_VN = `
.fin-vn { color: var(--portal-text, #0f172a) }
/* 1. sem negrito: no máximo 500 */
${PESADO},
.fin-vn b, .fin-vn strong, .fin-vn h1, .fin-vn h2, .fin-vn h3, .fin-vn h4, .fin-vn th, .fin-vn label { font-weight: 500 !important }
/* 2. sem caixa alta */
${CAIXA_ALTA} { text-transform: none !important; letter-spacing: 0 !important }
/* 3. sem faixa colorida do lado do cartão */
${FAIXA} { border-left-width: 1px !important; border-left-color: var(--portal-border, #e2e8f0) !important }
/* 4. cartões com cantos 16; campos e botões com cantos 10 */
${CANTOS} { border-radius: 16px !important }
.fin-vn input:not([type="checkbox"]):not([type="radio"]), .fin-vn select, .fin-vn textarea, .fin-vn button { border-radius: 10px }
.fin-vn .task-card, .fin-vn [class*="card"] { transition: box-shadow .25s, transform .25s, border-color .25s }
.fin-vn .task-card:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55) }
/* 5. cabeçalhos das colunas: limpos, sem o bloco verde */
.fin-vn .fin-col-title, ${VERDE} {
  background: var(--surface, #fefefe) !important; border: 1px solid var(--portal-border, #e2e8f0) !important; color: var(--portal-text, #0f172a) !important;
  font-size: 15px !important; font-weight: 500 !important; letter-spacing: 0 !important }
/* coluna Vencido em vermelho e Sem boleto em âmbar, só no texto e na borda */
.fin-vn .fin-col-title${ambos('background', '#fecaca')[0]}, .fin-vn .fin-col-title${ambos('background', '#fecaca')[1]},
.fin-vn .fin-col-title[style*="rgb(254, 202, 202)"] { color: #dc2626 !important; border-color: color-mix(in srgb, #dc2626 30%, var(--portal-border, #e2e8f0)) !important }
.fin-vn .fin-col-title${ambos('background', '#fde68a')[0]}, .fin-vn .fin-col-title${ambos('background', '#fde68a')[1]},
.fin-vn .fin-col-title[style*="rgb(253, 230, 138)"] { color: #b45309 !important; border-color: color-mix(in srgb, #d97706 30%, var(--portal-border, #e2e8f0)) !important }
.fin-vn .fin-col-title > span { background: var(--portal-bg-secondary, #f1f5f9) !important; color: var(--portal-text-secondary, #475569) }
/* 6. números com dígitos alinhados */
.fin-vn [style*="R$"], .fin-vn td { font-variant-numeric: tabular-nums }
`
