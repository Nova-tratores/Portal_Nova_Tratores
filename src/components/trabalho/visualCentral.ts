// Estilo POS NewPortal (docs/estilo-pos-newportal.md) + tela cheia (docs/padrao-telas.md) em TODA a Central de
// Trabalho: Quadros, Agenda, Cronograma, Reuniões, Sala, Visão gerencial, Ideias e Pendências (José, 04/11/2026:
// "em toda a central de trabalho, em todos os módulos, aplica o estilo new portal, e todas telas cheias").
// As telas usam estilo inline; esta camada (sob .ct-vn, montada nos layouts) ajusta todas de uma vez, sem mexer
// em cada componente — o mesmo jeito do Opa (components/opa/visualOpa.ts).

// o React escreve o estilo como "font-weight:700" no servidor e "font-weight: 700" no navegador
const ambos = (prop: string, v: string | number) => [`[style*="${prop}:${v}"]`, `[style*="${prop}: ${v}"]`]
const PESADO = [600, 700, 800, 900].flatMap((p) => ambos('font-weight', p)).map((s) => `.ct-vn ${s}:not(i):not([class*="fa-"]):not(svg)`).join(',\n')
const CENTRO = ['margin:0 auto', 'margin: 0 auto', 'margin: 0px auto'].map((m) => `.ct-vn [style*="${m}"]:not([role="dialog"] *):not([role="dialog"])`).join(',\n')

export const ESTILO_CENTRAL_VN = `
.ct-vn { color: var(--portal-text, #0f172a) }
/* tela cheia: o conteúdo usa a largura toda (sem coluna centralizada de 1100–1500 px) */
${CENTRO} { max-width: none !important }
/* 1. sem negrito: no máximo 500 (ícone do Font Awesome precisa do 900) */
${PESADO},
.ct-vn b, .ct-vn strong, .ct-vn h1, .ct-vn h2, .ct-vn h3, .ct-vn h4, .ct-vn th { font-weight: 500 !important }
/* 2. sem caixa alta */
.ct-vn [style*="text-transform:uppercase"], .ct-vn [style*="text-transform: uppercase"] { text-transform: none !important; letter-spacing: 0 !important }
/* 3. sem faixa colorida do lado do cartão */
.ct-vn [style*="border-left:4px"], .ct-vn [style*="border-left: 4px"], .ct-vn [style*="border-left:3px"], .ct-vn [style*="border-left: 3px"],
.ct-vn [style*="border-left:5px"], .ct-vn [style*="border-left: 5px"] { border-left-width: 1px !important; border-left-color: var(--portal-border, #e2e8f0) !important }
/* 4. cartões com cantos 16 */
.ct-vn [style*="border-radius:12px"][style*="border:"], .ct-vn [style*="border-radius: 12px"][style*="border: 1px"],
.ct-vn [style*="border-radius:14px"][style*="border:"], .ct-vn [style*="border-radius: 14px"][style*="border: 1px"] { border-radius: 16px !important }
/* 5. campos com cantos 10 */
.ct-vn input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), .ct-vn select, .ct-vn textarea { border-radius: 10px }

/* barra da Central: abas estilo Chrome, sem o nome do módulo ao lado (docs/padrao-telas.md) */
.ct-nav { background: color-mix(in srgb, #dc2626 4%, var(--portal-bg, #f6f6f6)) !important; border-bottom: 1px solid var(--portal-border, #e5e7eb) !important; padding-top: 8px !important; align-items: flex-end !important }
.ct-nav-abas { gap: 2px !important; align-items: flex-end !important }
.ct-aba { display: flex; align-items: center; gap: 8px; padding: 9px 16px 10px; margin-bottom: -1px; border: 1px solid transparent; border-bottom: 0;
  border-radius: 12px 12px 0 0; font-size: 14px; font-weight: 400; color: var(--portal-text-secondary, #475569); text-decoration: none; white-space: nowrap;
  transition: background .15s, color .15s }
.ct-aba:hover { background: color-mix(in srgb, #dc2626 6%, transparent); color: var(--portal-text, #0f172a) }
.ct-aba .ct-aba-ic { width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center; color: #dc2626; background: color-mix(in srgb, #dc2626 9%, transparent) }
.ct-aba.on { background: var(--portal-surface, #fefefe); border-color: var(--portal-border, #e5e7eb); color: var(--portal-text, #0f172a); font-weight: 500 }
.ct-aba.on .ct-aba-ic { background: #dc2626; color: #fefefe }
.ct-aba .ct-aba-n { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: #dc2626; color: #fefefe }
.ct-nav-acoes { align-self: center }
`
