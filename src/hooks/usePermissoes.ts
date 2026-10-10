'use client'
import { ehModuloCentral, temCentral } from '@/lib/trabalho/modulo'
import { permite } from '@/lib/permissoes/explicitas'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'

interface Permissoes {
  id: string
  user_id: string
  is_admin: boolean
  is_dev?: boolean
  categoria: string
  mecanico_role?: string | null
  mecanico_tecnico_nome?: string | null
  modulos_permitidos: string[]
}

// Um canal Realtime por usuário, compartilhado: o hook é montado em várias
// partes da mesma página; abrir um canal por instância multiplicaria as
// assinaturas no servidor e `removeChannel` de uma derrubaria as outras.
const ouvintes = new Map<string, { canal: ReturnType<typeof supabase.channel>; cbs: Set<() => void> }>()
function assinarMudancas(userId: string, cb: () => void): () => void {
  let reg = ouvintes.get(userId)
  if (!reg) {
    const cbs = new Set<() => void>()
    const canal = supabase.channel('permissoes-' + userId + '-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_permissoes', filter: `user_id=eq.${userId}` }, () => { cbs.forEach((f) => f()) })
      .subscribe()
    reg = { canal, cbs }
    ouvintes.set(userId, reg)
  }
  reg.cbs.add(cb)
  return () => {
    const r = ouvintes.get(userId)
    if (!r) return
    r.cbs.delete(cb)
    if (r.cbs.size === 0) { supabase.removeChannel(r.canal); ouvintes.delete(userId) }
  }
}

export function usePermissoes(userId: string | undefined) {
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchedId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      setPermissoes(null)
      fetchedId.current = undefined
      return
    }

    fetchedId.current = userId
    setLoading(true)
    const buscar = async () => {
      try {
        const { data } = await supabase
          .from('portal_permissoes')
          .select('*')
          .eq('user_id', userId)
          .single()
        setPermissoes(data)
      } catch {
        setPermissoes(null)
      } finally {
        setLoading(false)
      }
    }
    buscar()
  }, [userId])

  // Relê a linha SEM piscar o loading (usado pelo Realtime e pela volta à aba).
  // Caso real (08/10/2026): o admin liberou uma tela e a pessoa seguiu vendo
  // "Acesso Restrito" porque a aba já estava aberta — só recarregando resolvia.
  const recarregar = useCallback(async () => {
    if (!userId) return
    try {
      const { data } = await supabase
        .from('portal_permissoes')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      if (data) setPermissoes(data)
    } catch { /* mantém o que já tinha */ }
  }, [userId])

  // Realtime na PRÓPRIA linha: o /admin salvou → relê na hora. Exige a tabela na
  // publicação (sql/realtime-portal-permissoes.sql); sem isso o canal nunca
  // dispara e fica só a releitura ao voltar pra aba (abaixo). UM canal por
  // usuário compartilhado entre todas as instâncias do hook (layout + página +
  // navs montam várias) — ver assinarMudancas.
  useEffect(() => {
    if (!userId) return
    return assinarMudancas(userId, recarregar)
  }, [userId, recarregar])

  useRefreshOnFocus(recarregar, 30_000)

  // Se userId mudou mas o effect ainda não rodou, considerar como loading
  const isEffectivelyLoading = loading || (!!userId && userId !== fetchedId.current)

  const isDev = permissoes?.is_dev === true
  // Dev tem todos os acessos de Admin (e mais)
  const isAdmin = permissoes?.is_admin === true || isDev

  // Acesso a um módulo (ver/entrar na página). Inclui quem tem só permissões
  // granulares dele (ex: tem 'requisicoes:criar' mas não 'requisicoes').
  const temAcesso = (modulo: string): boolean => {
    if (isAdmin) return true
    const perms = permissoes?.modulos_permitidos ?? []
    if (ehModuloCentral(modulo)) return temCentral(perms)
    return perms.includes(modulo) || perms.some((p) => p.startsWith(modulo + ':'))
  }

  // Permissão de uma AÇÃO do módulo. Admin → tudo; módulo puro → tudo (acesso
  // total) MENOS as ações explícitas (ex.: pos:faturar, ver lib/permissoes/explicitas);
  // 'modulo:acao' → aquela ação. Sem `acao`, equivale a temAcesso.
  const pode = (modulo: string, acao?: string): boolean =>
    permite(permissoes?.modulos_permitidos ?? [], isAdmin, modulo, acao)

  return { permissoes, isAdmin, isDev, temAcesso, pode, loading: isEffectivelyLoading }
}
