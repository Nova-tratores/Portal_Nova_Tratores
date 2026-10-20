'use client'
// Carreira e comissões (/api/mecanicos/carreira) carregadas UMA vez e divididas entre os
// componentes da aba Ocorrências (escudos com o ícone da liga, carta do técnico, seção de carreira).
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { CarreiraTecnico } from '@/lib/mecanicos/carreira'
import type { ComissaoTecnico } from '@/lib/mecanicos/carreira-server'

export interface DadosCarreira { mesAtual: string; carreira: CarreiraTecnico[]; comissoes: ComissaoTecnico[]; inicioSistema: string; fotos?: Record<string, string>; pontosMes?: Record<string, number> }

let cache: { dados: DadosCarreira; em: number } | null = null
let pedido: Promise<DadosCarreira> | null = null

async function buscar(): Promise<DadosCarreira> {
  const r = await fetch('/api/mecanicos/carreira', { headers: await authHeaders(), cache: 'no-store' })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error || 'Falha ao carregar a carreira')
  return j
}

export function useCarreira(): { dados: DadosCarreira | null; erro: string | null } {
  const [dados, setDados] = useState<DadosCarreira | null>(() => (cache && Date.now() - cache.em < 5 * 60_000 ? cache.dados : null))
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (dados) return
    let vivo = true
    pedido ||= buscar().finally(() => { pedido = null })
    pedido.then((d) => { cache = { dados: d, em: Date.now() }; if (vivo) setDados(d) }).catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a carreira') })
    return () => { vivo = false }
  }, [dados])
  return { dados, erro }
}
