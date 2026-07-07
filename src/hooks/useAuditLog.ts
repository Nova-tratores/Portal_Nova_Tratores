'use client'
import { useCallback } from 'react'
import { useAuth } from './useAuth'
import { authHeaders } from '@/lib/auth/client'

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

  // A escrita no audit_log passou pro servidor (rota /api/audit/log): o RLS agora
  // bloqueia insert direto pelo navegador, e o servidor grava a identidade real
  // (do token), não a que o cliente afirma. A interface do hook não mudou.
  const log = useCallback(async (params: LogParams) => {
    if (!userProfile) return
    try {
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(params),
      })
    } catch {
      // auditoria é best-effort — não quebra a ação do usuário
    }
  }, [userProfile])

  return { log }
}
