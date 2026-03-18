'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Permissoes {
  id: string
  user_id: string
  is_admin: boolean
  categoria: string
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

  const isAdmin = permissoes?.is_admin === true

  const temAcesso = (modulo: string): boolean => {
    if (isAdmin) return true
    return permissoes?.modulos_permitidos?.includes(modulo) ?? false
  }

  return { permissoes, isAdmin, temAcesso, loading: isEffectivelyLoading }
}
