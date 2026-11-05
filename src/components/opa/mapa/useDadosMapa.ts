'use client'
// Carrega o mapa do Opa (/api/opa/mapa) e grava as mudanças do admin.
import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { DadosMapa } from './PlantaLoja'

export function useDadosMapa() {
  const [dados, setDados] = useState<DadosMapa | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [semMigracao, setSemMigracao] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/opa/mapa', { headers: await authHeaders() })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setSemMigracao(!!j.migracaoFaltando); setErro(j.error || 'Não foi possível carregar o mapa.'); return }
      setDados(j); setErro(null); setSemMigracao(false)
    } catch { setErro('Sem conexão. Tente de novo.') }
  }, [])

  useEffect(() => { Promise.resolve().then(carregar) }, [carregar])

  /** grava uma ação do admin; devolve o JSON da resposta (ou null com o erro em `erro`) */
  const enviar = useCallback(async (corpo: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetch('/api/opa/mapa', {
        method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || 'Não foi possível salvar.'); return null }
      setErro(null)
      return j
    } catch { setErro('Sem conexão: a mudança não foi salva.'); return null }
  }, [])

  return { dados, setDados, erro, setErro, semMigracao, carregar, enviar }
}
