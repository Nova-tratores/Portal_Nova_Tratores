// Estilo POS NewPortal (docs/estilo-pos-newportal.md) + tela cheia (docs/padrao-telas.md) no Opa inteiro:
// Ocorrências, Mapa, Peças S/Estoque, Guardar peças e Patrimônio Loja (José, 26/10/2026; refeito em
// 19/11/2026: "aplica o estilo new portal em todos eles" — agora no mesmo nível da Central de Trabalho).
// As telas do Opa usam estilo inline; esta camada (sob .opa-vn, montada em app/(portal)/opa/layout.tsx)
// ajusta todas de uma vez, sem mexer em cada componente. Cor do Opa: #64748B (setor Adicionais).

// o React escreve o estilo como "font-weight:700" no servidor e "font-weight: 700" no navegador → casar os dois
const ambos = (prop: string, v: string | number) => [`[style*="${prop}:${v}"]`, `[style*="${prop}: ${v}"]`]
const PESADO = [600, 700, 800, 900].flatMap((p) => ambos('font-weight', p)).map((s) => `.opa-vn ${s}:not(i):not([class*="fa-"]):not(svg)`).join(',\n')
const CENTRO = ['margin:0 auto', 'margin: 0 auto', 'margin: 0px auto'].map((m) => `.opa-vn [style*="${m}"]:not([role="dialog"] *):not([role="dialog"])`).join(',\n')
const CAIXA_ALTA = ambos('text-transform', 'uppercase').map((s) => `.opa-vn ${s}`).join(', ')
const FAIXA = [3, 4, 5].flatMap((n) => ambos('border-left', `${n}px`)).map((s) => `.opa-vn ${s}`).join(',\n')
const CARTAO = [12, 14].flatMap((r) => [`[style*="border-radius:${r}px"][style*="border:1px"]`, `[style*="border-radius: ${r}px"][style*="border: 1px"]`])
  .map((s) => `.opa-vn ${s}`).join(',\n')

export const ESTILO_OPA_VN = `
.opa-vn { color: var(--portal-text, #0f172a) }
/* tela cheia: o conteúdo usa a largura toda (sem coluna centralizada) */
${CENTRO} { max-width: none !important }
/* 1. sem negrito: no máximo 500 (ícone do Font Awesome precisa do 900) */
${PESADO},
.opa-vn b, .opa-vn strong, .opa-vn h1, .opa-vn h2, .opa-vn h3, .opa-vn h4, .opa-vn th { font-weight: 500 !important }
/* 2. sem caixa alta */
${CAIXA_ALTA} { text-transform: none !important; letter-spacing: 0 !important }
/* 3. sem faixa colorida do lado do cartão */
${FAIXA} { border-left-width: 1px !important; border-left-color: var(--portal-border, #e2e8f0) !important }
/* 4. cartões com cantos 16 e o mesmo hover do POS */
${CARTAO} { border-radius: 16px !important }
.opa-vn .opa-card-hover { transition: box-shadow .25s, transform .25s, border-color .25s }
.opa-vn .opa-card-hover:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, #64748b 35%, var(--portal-border, #e2e8f0)) }
/* 5. campos e botões com cantos 10 */
.opa-vn input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), .opa-vn select, .opa-vn textarea { border-radius: 10px }
/* título de seção com ícone em quadradinho */
.opa-vn .opa-tit { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 16px; font-weight: 500; color: var(--portal-text, #0f172a) }
.opa-vn .opa-tit-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: none;
  color: var(--c, #64748b); background: color-mix(in srgb, var(--c, #64748b) 9%, var(--surface, #fefefe));
  border: 1px solid color-mix(in srgb, var(--c, #64748b) 18%, transparent) }
`
