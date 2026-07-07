'use client'
// Contexto do módulo Gestão de Vendas: competência (mês/ano) + loja
// (TODAS/NOVA/CASTRO), persistidos em localStorage. Vale para todas as telas.

import { createContext, useCallback, useContext, useState } from 'react'

export type ContaGv = 'TODAS' | 'NOVA' | 'CASTRO'

type GvState = {
  mes: number
  ano: number
  conta: ContaGv
  setCompetencia: (mes: number, ano: number) => void
  setConta: (c: ContaGv) => void
}

const KEY = 'gv_selecao_v2' // { mes, ano, conta } — v2: padrão passou a ser TODAS

function lerSelecao(): { mes: number; ano: number; conta: ContaGv } {
  const hoje = new Date()
  const padrao = { mes: hoje.getMonth() + 1, ano: hoje.getFullYear(), conta: 'TODAS' as const }
  if (typeof window === 'undefined') return padrao
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return padrao
    const s = JSON.parse(raw)
    return {
      mes: Number.isInteger(s.mes) && s.mes >= 1 && s.mes <= 12 ? s.mes : padrao.mes,
      ano: Number.isInteger(s.ano) ? s.ano : padrao.ano,
      conta: s.conta === 'CASTRO' || s.conta === 'NOVA' ? s.conta : 'TODAS',
    }
  } catch {
    return padrao
  }
}

const GvContext = createContext<GvState | null>(null)

export function GvProvider({ children }: { children: React.ReactNode }) {
  const [sel, setSel] = useState(lerSelecao)

  const persistir = useCallback((next: { mes: number; ano: number; conta: ContaGv }) => {
    setSel(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const setCompetencia = useCallback(
    (mes: number, ano: number) => persistir({ ...sel, mes, ano }),
    [sel, persistir],
  )
  const setConta = useCallback(
    (conta: ContaGv) => persistir({ ...sel, conta }),
    [sel, persistir],
  )

  return (
    <GvContext.Provider value={{ ...sel, setCompetencia, setConta }}>
      {children}
    </GvContext.Provider>
  )
}

export function useGv(): GvState {
  const ctx = useContext(GvContext)
  if (!ctx) throw new Error('useGv deve ser usado dentro de <GvProvider>')
  return ctx
}
