'use client'
// Um período só para a Gestão Pós Vendas inteira (José, 03/11/2026: "tenho que alterar o mês novamente quando
// entro na aba equipe"): Resultados, Equipe, os cartões dos técnicos e a ficha leem e mudam o MESMO período.
// Fica na memória da página e na aba do navegador (voltar para a aba não volta para hoje).
import { useCallback, useSyncExternalStore } from 'react'
import type { Escala } from '@/lib/mecanicos/painel'

export interface PeriodoGestao { tipo: Escala; ref: string }

const CHAVE = 'cpv-periodo-v1'
export const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const mesAtualSP = () => hojeSP().slice(0, 7)
const PADRAO: PeriodoGestao = { tipo: 'semana', ref: hojeSP() }

let atual: PeriodoGestao | null = null
const ouvintes = new Set<() => void>()

function ler(): PeriodoGestao {
  if (atual) return atual
  try {
    const t = sessionStorage.getItem(CHAVE)
    const p = t ? (JSON.parse(t) as PeriodoGestao) : null
    // data no futuro (aba aberta de ontem pra hoje não tem problema; só não deixa passar de hoje)
    atual = p && /^\d{4}-\d{2}-\d{2}$/.test(p.ref) && p.ref <= hojeSP() ? p : { tipo: 'semana', ref: hojeSP() }
  } catch { atual = { tipo: 'semana', ref: hojeSP() } }
  return atual
}

function gravar(p: PeriodoGestao) {
  if (atual && atual.tipo === p.tipo && atual.ref === p.ref) return
  atual = p
  try { sessionStorage.setItem(CHAVE, JSON.stringify(p)) } catch { /* sem armazenamento: fica só na memória */ }
  ouvintes.forEach((f) => f())
}

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }

/** Tipo (dia/semana/mês/ano) e data de referência do período da Gestão. */
export function usePeriodoGestao() {
  const p = useSyncExternalStore(assinar, ler, () => PADRAO)
  const setTipo = useCallback((tipo: Escala) => gravar({ ...ler(), tipo }), [])
  const setRef = useCallback((r: string | ((ant: string) => string)) => { const a = ler(); gravar({ ...a, ref: typeof r === 'function' ? r(a.ref) : r }) }, [])
  return { tipo: p.tipo, ref: p.ref, setTipo, setRef }
}

/** Só o mês (YYYY-MM) do período. Trocar o mês leva a data para o dia 1 (ou hoje, no mês atual) sem mudar o tipo. */
export function useMesGestao(): [string, (m: string) => void] {
  const p = useSyncExternalStore(assinar, ler, () => PADRAO)
  const setMes = useCallback((m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return
    const a = ler(), hoje = hojeSP()
    if (a.ref.slice(0, 7) === m) return
    if (m > hoje.slice(0, 7)) return
    gravar({ ...a, ref: m === hoje.slice(0, 7) ? hoje : `${m}-01` })
  }, [])
  return [p.ref.slice(0, 7), setMes]
}
