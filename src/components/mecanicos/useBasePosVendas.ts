'use client'
// Base do Centro do Pós-Vendas baixada UMA vez (GET /api/mecanicos/base, ~80 KB compactada) e
// guardada na memória da página: trocar dia/semana/mês/ano é calculado na hora, sem servidor.
// Passados 5 min, busca de novo por trás sem apagar a tela.
import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { BaseDados } from '@/lib/mecanicos/painel'

export type BaseTela = BaseDados & { de: string; ate: string; geradoEm: string }

let guardada: { base: BaseTela; em: number } | null = null
let buscando: Promise<BaseTela> | null = null
const ouvintes = new Set<(b: BaseTela) => void>()

async function buscar(forcar: boolean): Promise<BaseTela> {
  if (buscando && !forcar) return buscando
  buscando = (async () => {
    const r = await fetch(`/api/mecanicos/base${forcar ? '?forcar=1' : ''}`, { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
    guardada = { base: j, em: Date.now() }
    ouvintes.forEach((f) => f(j))
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
