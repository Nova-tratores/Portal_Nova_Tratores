'use client'
// Abas do Centro do Pós-Vendas (José, 20/10/2026: "deixa mais bonito esses botões, algo profissional"):
// um seletor só, com as três abas lado a lado e o destaque que desliza até a escolhida.
import type { AbaCPV } from './CentroPosVendas'

const ABAS: { id: AbaCPV; rot: string; sub: string; ic: string; cor: string }[] = [
  { id: 'painel', rot: 'Painel', sub: 'dinheiro, horas e gastos', ic: 'fa-chart-column', cor: '#0369a1' },
  { id: 'ocorrencias', rot: 'Mecânicos', sub: 'horas, pontos e defesas', ic: 'fa-user-gear', cor: '#6d28d9' },
]

export default function AbasCentro({ aba, onAba }: { aba: AbaCPV; onAba: (a: AbaCPV) => void }) {
  const achou = ABAS.findIndex((a) => a.id === aba), i = Math.max(0, achou)
  return (
    <div className={`ac ${achou < 0 ? 'fora' : ''}`} role="tablist" style={{ '--i': i, '--n': ABAS.length, '--c': ABAS[i].cor } as React.CSSProperties}>
      <style>{ESTILO_AC}</style>
      <span className="ac-luz" aria-hidden />
      {ABAS.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={a.id === aba} className={a.id === aba ? 'on' : ''} style={{ '--cc': a.cor } as React.CSSProperties} onClick={() => onAba(a.id)}>
          <span className="ac-ic"><i className={`fas ${a.ic}`} /></span>
          <span className="ac-txt"><b>{a.rot}</b><small>{a.sub}</small></span>
        </button>
      ))}
    </div>
  )
}

const ESTILO_AC = `
.ac { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 4px; padding: 5px; border-radius: 999px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.05); min-width: min(440px, 100%) }
.ac.fora .ac-luz { opacity: 0 }
.ac-luz { position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc((100% - 10px - (var(--n) - 1) * 4px) / var(--n)); border-radius: 999px; background: color-mix(in srgb, var(--c) 9%, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 28%, transparent); transform: translateX(calc(var(--i) * (100% + 4px))); transition: transform .45s cubic-bezier(.3,1.2,.45,1), background .3s, border-color .3s }
.ac-luz::after { display: none }
.ac button { position: relative; z-index: 1; display: flex; align-items: center; gap: 11px; border: none; background: transparent; padding: 7px 18px 7px 7px; border-radius: 999px; font-family: inherit; text-align: left; cursor: pointer; color: var(--portal-text-muted, #64748b); transition: color .25s }
.ac button:hover:not(.on) { color: var(--portal-text, #0f172a) } .ac button:hover:not(.on) .ac-ic { background: color-mix(in srgb, var(--cc) 10%, transparent); color: var(--cc) }
.ac-ic { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; background: var(--portal-bg, #f1f5f9); transition: background .25s, color .25s, transform .25s }
.ac button.on { color: var(--portal-text, #0f172a) } .ac button.on .ac-ic { background: var(--cc); color: #fefefe; box-shadow: 0 4px 10px color-mix(in srgb, var(--cc) 35%, transparent); transform: scale(1.04) }
.ac-txt { display: grid; min-width: 0 } .ac-txt b { font-size: 14.5px; font-weight: 900; line-height: 1.15 } .ac-txt small { font-size: 11.5px; font-weight: 600; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
@media (max-width: 720px) { .ac { min-width: 0; flex: 1 } .ac-txt small { display: none } .ac button { padding: 8px; gap: 8px } .ac-ic { width: 30px; height: 30px } }
@media (prefers-reduced-motion: reduce) { .ac-luz { transition: none } }
`
