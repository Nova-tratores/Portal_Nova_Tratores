// Tema escuro do DRE Financeiro (auditoria 06/11/2026: abas pastel com texto pastel, cartões claros e números
// vermelho/verde-escuro sobre fundo escuro, contraste 1.1–1.6). As telas são port fiel do dashboard antigo e usam
// as classes CLARAS do Tailwind (bg-*-50/100, text-*-700/800/900); aqui, só com [data-theme="dark"] e só dentro
// de .dre-root, cada uma vira a versão escura: fundo = a cor a 16% sobre o cartão, texto = o tom 300.
// O tema claro não muda.

const CORES = {
  red: ['#ef4444', '#fca5a5'], rose: ['#f43f5e', '#fda4af'], orange: ['#f97316', '#fdba74'], amber: ['#f59e0b', '#fcd34d'],
  yellow: ['#eab308', '#fde047'], lime: ['#84cc16', '#bef264'], green: ['#22c55e', '#86efac'], emerald: ['#10b981', '#6ee7b7'],
  teal: ['#14b8a6', '#5eead4'], cyan: ['#06b6d4', '#67e8f9'], sky: ['#0ea5e9', '#7dd3fc'], blue: ['#3b82f6', '#93c5fd'],
  indigo: ['#6366f1', '#a5b4fc'], violet: ['#8b5cf6', '#c4b5fd'], purple: ['#a855f7', '#d8b4fe'], fuchsia: ['#d946ef', '#f0abfc'],
  pink: ['#ec4899', '#f9a8d4'],
}

const E = '[data-theme="dark"] .dre-root'

function regrasCores() {
  const out = []
  for (const [c, [base, claro]] of Object.entries(CORES)) {
    out.push(`${E} :is(.bg-${c}-50, .bg-${c}-100, .bg-${c}-200) { background-color: color-mix(in srgb, ${base} 16%, var(--portal-bg-card)) !important }`)
    out.push(`${E} :is(.text-${c}-600, .text-${c}-700, .text-${c}-800, .text-${c}-900) { color: ${claro} !important }`)
    out.push(`${E} :is(.border-${c}-100, .border-${c}-200, .border-${c}-300) { border-color: color-mix(in srgb, ${base} 40%, var(--portal-border)) !important }`)
  }
  return out.join('\n')
}

export const ESTILO_DRE_ESCURO = `
${regrasCores()}
${E} :is(.bg-white, .bg-slate-50, .bg-gray-50) { background-color: var(--portal-bg-card) !important }
${E} :is(.bg-slate-100, .bg-gray-100, .bg-slate-200) { background-color: var(--portal-bg-secondary) !important }
${E} :is(.text-slate-700, .text-slate-800, .text-slate-900, .text-gray-700, .text-gray-800, .text-gray-900, .text-black) { color: var(--portal-text) !important }
${E} :is(.text-slate-400, .text-slate-500, .text-slate-600, .text-gray-400, .text-gray-500, .text-gray-600) { color: var(--portal-text-secondary) !important }
${E} :is(.border-slate-100, .border-slate-200, .border-slate-300, .border-gray-100, .border-gray-200) { border-color: var(--portal-border) !important }
/* barra do módulo e abas (cores fixas no layout) */
${E} .dre-barra { background: var(--portal-bg-card) !important; border-bottom-color: var(--portal-border) !important }
${E} .dre-titulo { color: var(--portal-text) !important }
${E} .dre-aba:not(.on) { background: color-mix(in srgb, var(--dc) 22%, var(--portal-bg-card)) !important; color: color-mix(in srgb, var(--dc) 40%, #fefefe) !important }
${E} .dre-conta:not(.on) { background: var(--portal-bg-card) !important; color: #6ee7b7 !important }
`
