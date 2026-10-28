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
      <span className="cxa-t">{on ? 'Com OS não faturadas' : 'Só OS faturadas'}</span>
    </label>
  )
}
const ESTILO_CXA = `
.cxa { position: relative; display: inline-flex; gap: 8px; align-items: center; background: #f1f5f9; border-radius: 99px; padding: 5px 12px 5px 6px; cursor: pointer; transition: background .2s; user-select: none }
.cxa:hover { background: #e2e8f0 } .cxa input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none }
.cxa input:focus-visible + .cxa-sw { outline: 2px solid #f59e0b; outline-offset: 2px }
.cxa-sw { position: relative; flex: none; width: 28px; height: 16px; border-radius: 99px; background: #cbd5e1; transition: background .25s } .cxa-sw i { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fefefe; transition: transform .25s ease }
.cxa.on { background: #fef3c7 } .cxa.on .cxa-sw { background: #f59e0b } .cxa.on .cxa-sw i { transform: translateX(12px) }
.cxa-t { font-size: 13px; color: var(--portal-text, #0f172a) }
`
