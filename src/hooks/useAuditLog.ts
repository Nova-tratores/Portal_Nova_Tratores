'use client'
import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { supabase } from '@/lib/supabase'

interface LogParams {
  sistema: string
  acao: string
  entidade?: string
  entidade_id?: string
  entidade_label?: string
  detalhes?: Record<string, unknown>
}

export function useAuditLog() {
  const { userProfile } = useAuth()

  const log = useCallback(async (params: LogParams) => {
    if (!userProfile) return
    await supabase.from('audit_log').insert([{
      user_id: userProfile.id,
      user_nome: userProfile.nome,
      ...params,
    }])
  }, [userProfile])

  return { log }
}
