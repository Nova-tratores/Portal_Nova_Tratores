'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

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
    return perms.includes(modulo) || perms.some((p) => p.startsWith(modulo + ':'))
  }

  // Permissão de uma AÇÃO do módulo. Admin → tudo; módulo puro → tudo (acesso
  // total); 'modulo:acao' → aquela ação. Sem `acao`, equivale a temAcesso.
  const pode = (modulo: string, acao?: string): boolean => {
    if (isAdmin) return true
    const perms = permissoes?.modulos_permitidos ?? []
    if (perms.includes(modulo)) return true
    if (!acao) return perms.some((p) => p.startsWith(modulo + ':'))
    return perms.includes(`${modulo}:${acao}`)
  }

  return { permissoes, isAdmin, isDev, temAcesso, pode, loading: isEffectivelyLoading }
}
