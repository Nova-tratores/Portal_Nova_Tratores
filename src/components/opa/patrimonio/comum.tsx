'use client'
// Patrimônio Loja (aba do Opa) — chamadas às rotas /api/patrimonio/*, a
// permissão (módulo 'patrimonio') e pedaços de tela comuns.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { mensagemErro } from '@/lib/opa-pecas/fotos'
import type { Local } from '@/lib/opa-pecas/tipos'
import { INFO_ESTADO, type Estado, type ItemPat } from '@/lib/patrimonio/tipos'

export const COR_PAT = '#4F46E5'

async function cabecalho(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token || ''
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

/** fetch nas rotas do patrimônio; lança com a mensagem do servidor. */
export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let r: Response
  try {
    r = await fetch(url, { method: init?.method || 'GET', headers: await cabecalho(), body: init?.body ? JSON.stringify(init.body) : undefined, cache: 'no-store' })
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.ok === false) throw new Error(j.erro || `Erro ${r.status}`)
  return j as T
}

export interface BasePat {
  userId: string | null
  pode: boolean
  carregandoPermissao: boolean
  itens: ItemPat[]
  locais: Local[]
  tags: string[]
  categorias: string[]
  carregando: boolean
  erro: string | null
  nomeLocal: (id: string) => string
  recarregar: () => void
}

/** Usuário, permissão e a lista (com locais, tags e categorias). */
export function useBasePat(): BasePat {
  const { userProfile } = useAuth()
  const { pode, loading } = usePermissoes(userProfile?.id)
  const liberado = !loading && pode('patrimonio')
  const [dados, setDados] = useState<{ itens: ItemPat[]; locais: Local[]; tags: string[]; categorias: string[] }>({ itens: [], locais: [], tags: [], categorias: [] })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!liberado) return
    let vivo = true
    api<{ itens: ItemPat[]; locais: Local[]; tags: string[]; categorias: string[] }>('/api/patrimonio')
      .then((d) => { if (vivo) { setDados(d); setErro(null) } })
      .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [liberado, versao])

  const nomes = Object.fromEntries(dados.locais.map((l) => [l.id, l.nome]))
  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  return {
    userId: userProfile?.id || null, pode: liberado, carregandoPermissao: loading || !userProfile,
    ...dados, carregando: liberado && carregando, erro, nomeLocal: (id: string) => nomes[id] || id, recarregar,
  }
}

export function SeloEstado({ estado }: { estado: Estado }) {
  const i = INFO_ESTADO[estado]
  return <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: i.fundo, color: i.cor, whiteSpace: 'nowrap' }}>{i.rotulo}</span>
}

export function fmtReal(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtData(s: string | null | undefined): string {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return s
  if (s.length <= 10) return `${m[3]}/${m[2]}/${m[1]}`
  return new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
