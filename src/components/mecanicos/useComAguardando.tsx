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
export function CaixaAguardando({ compacta }: { compacta?: boolean }) {
  const on = useComAguardando()
  return (
    <label className={`cxa ${on ? 'on' : ''}`} title="Desmarcado: só conta horas de OS já faturadas. Marcado: soma as horas das OS preenchidas que ainda esperam faturar.">
      <style>{ESTILO_CXA}</style>
      <input type="checkbox" role="switch" aria-checked={on} checked={on} onChange={(e) => definirComAguardando(e.target.checked)} />
      <span className="cxa-sw" aria-hidden><i /></span>
      <span className="cxa-t"><b>Incluir OS ainda não faturadas</b>{!compacta && <small>{on ? 'somando as preenchidas que esperam faturar' : 'contando só o que já foi faturado'}</small>}</span>
    </label>
  )
}
const ESTILO_CXA = `
.cxa { position: relative; display: inline-flex; gap: 10px; align-items: center; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 7px 14px 7px 10px; cursor: pointer; transition: border-color .2s, background .2s, box-shadow .2s; user-select: none }
.cxa:hover { box-shadow: 0 4px 12px rgba(15,23,42,.07) } .cxa input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none }
.cxa input:focus-visible + .cxa-sw { outline: 2px solid #f59e0b; outline-offset: 2px }
.cxa-sw { position: relative; flex: none; width: 38px; height: 22px; border-radius: 99px; background: #cbd5e1; transition: background .25s } .cxa-sw i { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fefefe; box-shadow: 0 1px 3px rgba(15,23,42,.3); transition: transform .3s cubic-bezier(.3,1.4,.5,1) }
.cxa.on { background: #fffbeb; border-color: #fcd34d } .cxa.on .cxa-sw { background: #f59e0b } .cxa.on .cxa-sw i { transform: translateX(16px) }
.cxa-t { display: grid; line-height: 1.15 } .cxa-t b { font-size: 13.5px; font-weight: 800; color: var(--portal-text, #0f172a) } .cxa-t small { font-size: 11.5px; font-weight: 600; color: var(--portal-text-muted, #64748b) }
`
