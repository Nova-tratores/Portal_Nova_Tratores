'use client'
// Empresa do Financeiro (José, 06/11/2026): escolhida uma vez, no topo (FinanceiroNav), e valendo para todas as telas.
// Sempre uma empresa, Nova ou Castro (sem "As duas"). Lembrada por pessoa neste navegador; começa na Nova.
import { useCallback, useSyncExternalStore } from 'react'
import { useAuth } from '@/hooks/useAuth'

export type EmpresaFin = 'nova' | 'castro'
export const NOME_EMPRESA_FIN: Record<EmpresaFin, string> = { nova: 'Nova', castro: 'Castro' }
// logos tiradas das Configurações do Omie de cada empresa (recortes de print, fundo transparente)
export const LOGO_EMPRESA_FIN: Record<EmpresaFin, string> = { nova: '/Logo_Nova_Omie.png', castro: '/Logo_Castro.png' }

const EVENTO = 'fin-empresa'
const chave = (uid: string | undefined) => `fin-empresa:${uid || 'anon'}`
// navegador sem armazenamento: a escolha vale enquanto a página estiver aberta
let memoria: EmpresaFin = 'nova'
const ler = (uid: string | undefined): EmpresaFin => {
  try { return localStorage.getItem(chave(uid)) === 'castro' ? 'castro' : 'nova' } catch { return memoria }
}
// avisa as outras telas abertas (mesma aba pelo evento; outras abas pelo "storage")
const assinar = (avisar: () => void) => {
  window.addEventListener(EVENTO, avisar)
  window.addEventListener('storage', avisar)
  return () => { window.removeEventListener(EVENTO, avisar); window.removeEventListener('storage', avisar) }
}

export function useEmpresaFinanceiro(): [EmpresaFin, (e: EmpresaFin) => void] {
  const { userProfile } = useAuth()
  const uid = userProfile?.id
  const empresa = useSyncExternalStore(assinar, () => ler(uid), () => 'nova' as EmpresaFin)
  const mudar = useCallback((e: EmpresaFin) => {
    memoria = e
    try { localStorage.setItem(chave(uid), e) } catch { /* sem armazenamento: fica só na memória */ }
    window.dispatchEvent(new Event(EVENTO))
  }, [uid])
  return [empresa, mudar]
}
