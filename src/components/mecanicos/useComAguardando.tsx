'use client'
// Contar ou não as horas ainda NÃO faturadas (OS preenchidas esperando faturar) — José, 20/10/2026:
// "em todo esse módulo que conta horas dos técnicos, no Painel ou nas Ocorrências, não pode usar as
// horas ainda não faturadas; tem que deixar um checkbox para o usuário marcar". Começa DESMARCADO a cada
// vez que a tela abre; todas as caixinhas do módulo mexem no mesmo valor.
import { useSyncExternalStore } from 'react'

let valor = false
const ouvintes = new Set<() => void>()
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export function definirComAguardando(v: boolean) { valor = v; ouvintes.forEach((f) => f()) }
export function useComAguardando(): boolean { return useSyncExternalStore(assinar, () => valor, () => false) }

/** A caixinha (igual em todo o módulo). */
// pílula simples (José, 27/10/2026: "mais simples e bonito"); a explicação fica no title
export function CaixaAguardando(_: { compacta?: boolean }) {
  const on = useComAguardando()
  return (
    <label className={`cxa ${on ? 'on' : ''}`} title="Desmarcado: só conta horas de OS já faturadas. Marcado: soma as horas das OS preenchidas que ainda esperam faturar.">
      <style>{ESTILO_CXA}</style>
      <input type="checkbox" role="switch" aria-checked={on} checked={on} onChange={(e) => definirComAguardando(e.target.checked)} />
      <span className="cxa-sw" aria-hidden><i /></span>
      {/* nome fixo, a chave diz se está valendo (José, 06/11/2026: "Só OS faturadas" com a chave desligada confundia) */}
      <span className="cxa-t">Somar OS não faturadas</span>
    </label>
  )
}
const ESTILO_CXA = `
.cxa { position: relative; display: inline-flex; gap: 8px; align-items: center; background: var(--mx-bg1, #f1f5f9); border-radius: 99px; padding: 5px 12px 5px 6px; cursor: pointer; transition: background .2s; user-select: none }
.cxa:hover { background: var(--mx-bg2, #e2e8f0) } .cxa input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none }
.cxa input:focus-visible + .cxa-sw { outline: 2px solid #f59e0b; outline-offset: 2px }
.cxa-sw { position: relative; flex: none; width: 28px; height: 16px; border-radius: 99px; background: var(--mx-bg2, #cbd5e1); transition: background .25s } .cxa-sw i { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--mx-bg0, #fefefe); transition: transform .25s ease }
.cxa.on { background: var(--mx-p-amber, #fef3c7) } .cxa.on .cxa-sw { background: #f59e0b } .cxa.on .cxa-sw i { transform: translateX(12px) }
.cxa-t { font-size: 13px; color: var(--portal-text, #0f172a) }
/* tema escuro: cores dos hex fixos acima (no claro valem os próprios hex) */
[data-theme="dark"] { --mx-bg0: var(--portal-bg-card, #1a1a1a); --mx-bg1: var(--portal-bg-secondary, #262626); --mx-bg2: #2e2e2e; --mx-bg3: #3a3a3a; --mx-bd: var(--portal-border, #2a2a2a); --mx-t: var(--portal-text, #f5f5f5); --mx-t2: var(--portal-text-secondary, #a3a3a3); --mx-t3: var(--portal-text-muted, #949494); --mx-fg-red: var(--portal-red-fg, #f87171); --mx-p-red: rgb(248 113 113 / .15); --mx-pb-red: rgb(248 113 113 / .35); --mx-fg-orange: #fb923c; --mx-p-orange: rgb(251 146 60 / .15); --mx-pb-orange: rgb(251 146 60 / .35); --mx-fg-amber: var(--portal-amber-fg, #fbbf24); --mx-p-amber: rgb(251 191 36 / .15); --mx-pb-amber: rgb(251 191 36 / .35); --mx-fg-green: var(--portal-green-fg, #34d399); --mx-p-green: rgb(52 211 153 / .15); --mx-pb-green: rgb(52 211 153 / .35); --mx-fg-teal: var(--portal-teal-fg, #2dd4bf); --mx-p-teal: rgb(45 212 191 / .15); --mx-pb-teal: rgb(45 212 191 / .35); --mx-fg-blue: var(--portal-blue-fg, #60a5fa); --mx-p-blue: rgb(96 165 250 / .15); --mx-pb-blue: rgb(96 165 250 / .35); --mx-fg-violet: var(--portal-violet-fg, #a78bfa); --mx-p-violet: rgb(167 139 250 / .15); --mx-pb-violet: rgb(167 139 250 / .35); --mx-fg-pink: var(--portal-pink-fg, #f472b6); --mx-p-pink: rgb(244 114 182 / .15); --mx-pb-pink: rgb(244 114 182 / .35); }

`
