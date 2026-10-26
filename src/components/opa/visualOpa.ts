// Estilo POS NewPortal (docs/estilo-pos-newportal.md) aplicado ao Opa inteiro:
// Ocorrências, Peças S/Estoque, Guardar peças e Patrimônio Loja (José, 26/10/2026).
// As telas do Opa usam estilo inline; esta camada (sob .opa-vn, montada em
// app/(portal)/opa/layout.tsx) tira negrito, caixa alta e faixa lateral de todas
// de uma vez, sem mexer em cada componente.

const PESADO = [600, 700, 800, 900].map((p) => `.opa-vn [style*="font-weight: ${p}"]:not(i):not([class*="fa-"])`).join(',\n')

export const ESTILO_OPA_VN = `
.opa-vn { color: var(--portal-text, #0f172a) }
/* 1. sem negrito: no máximo 500 (ícone do Font Awesome precisa do 900) */
${PESADO},
.opa-vn b, .opa-vn strong, .opa-vn h1, .opa-vn h2, .opa-vn h3, .opa-vn th { font-weight: 500 !important }
/* 2. sem caixa alta */
.opa-vn [style*="text-transform: uppercase"] { text-transform: none !important; letter-spacing: 0 !important }
/* 3. sem faixa colorida do lado do cartão */
.opa-vn [style*="border-left: 4px"], .opa-vn [style*="border-left: 3px"] { border-left-width: 1px !important; border-left-color: var(--portal-border, #e2e8f0) !important }
/* 4. cartões com cantos 16 e o mesmo hover do POS */
.opa-vn [style*="border-radius: 12px"][style*="border: 1px solid"],
.opa-vn [style*="border-radius: 14px"][style*="border: 1px solid"] { border-radius: 16px !important }
.opa-vn .opa-card-hover { transition: box-shadow .25s, transform .25s, border-color .25s }
.opa-vn .opa-card-hover:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55) }
/* 5. campos e botões com cantos 10 */
.opa-vn input:not([type="checkbox"]):not([type="radio"]), .opa-vn select, .opa-vn textarea { border-radius: 10px }
/* título de seção com ícone em quadradinho */
.opa-vn .opa-tit { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 16px; font-weight: 500; color: var(--portal-text, #0f172a) }
.opa-vn .opa-tit-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: none;
  color: var(--c, #ea580c); background: color-mix(in srgb, var(--c, #ea580c) 9%, var(--surface, #fefefe));
  border: 1px solid color-mix(in srgb, var(--c, #ea580c) 18%, transparent) }
`
