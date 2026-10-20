'use client'
// Base do Centro do Pós-Vendas baixada UMA vez (GET /api/mecanicos/base) e guardada na memória da página:
// trocar dia/semana/mês/ano é calculado na hora, sem servidor. Passados 5 min, busca de novo por trás sem
// apagar a tela. A última base também fica guardada no navegador (José 19/10: "tá muito demorado"):
// ao abrir, a tela aparece na hora com ela e se atualiza sozinha quando a nova chega.
import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { BaseDados } from '@/lib/mecanicos/painel'

export type BaseTela = BaseDados & { de: string; ate: string; geradoEm: string }

const CHAVE_LOCAL = 'cpv-base-v1'
let guardada: { base: BaseTela; em: number } | null = null
let buscando: Promise<BaseTela> | null = null
const ouvintes = new Set<(b: BaseTela) => void>()

function lerLocal(): BaseTela | null {
  try { const t = localStorage.getItem(CHAVE_LOCAL); return t ? (JSON.parse(t) as BaseTela) : null } catch { return null }
}
function gravarLocal(b: BaseTela) {
  try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(b)) } catch { /* sem espaço: segue só na memória */ }
}

async function buscar(forcar: boolean): Promise<BaseTela> {
  if (buscando && !forcar) return buscando
  buscando = (async () => {
    const r = await fetch(`/api/mecanicos/base${forcar ? '?forcar=1' : ''}`, { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
    guardada = { base: j, em: Date.now() }
    ouvintes.forEach((f) => f(j))
    gravarLocal(j)
    return j as BaseTela
  })().finally(() => { buscando = null })
  return buscando
}

export function useBasePosVendas() {
  const [base, setBase] = useState<BaseTela | null>(guardada?.base || null)
  const [carregando, setCarregando] = useState(!guardada)
  const [erro, setErro] = useState('')

  useEffect(() => {
    ouvintes.add(setBase)
    let vivo = true
    // abre na hora com a última base do navegador (a nova chega por trás)
    if (!guardada) {
      const local = lerLocal()
      if (local) Promise.resolve().then(() => { if (vivo && !guardada) setBase(local) })
    }
    if (!guardada || Date.now() - guardada.em > 5 * 60_000) {
      Promise.resolve().then(() => { if (vivo) setCarregando(true) })
      buscar(false).then(() => { if (vivo) setErro('') }).catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha') }).finally(() => { if (vivo) setCarregando(false) })
    }
    return () => { vivo = false; ouvintes.delete(setBase) }
  }, [])

  const recarregar = useCallback(async () => {
    setCarregando(true)
    try { await buscar(true); setErro('') } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setCarregando(false) }
  }, [])

  return { base, carregando, erro, recarregar }
}
