// Cliente dos roteiros na OS: chamadas autenticadas + o aviso antes de concluir a OS.
import { authHeaders } from '@/lib/auth/client'
import { mensagemAvisoConclusao } from './roteiros'

export async function chamarRoteiros<T>(osId: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/roteiros`, {
    method: init.method || (init.json ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: init.json ? JSON.stringify(init.json) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(d.error || 'Erro'), { migracaoFaltando: !!d.migracaoFaltando })
  return d as T
}

/**
 * Antes de mover a OS para "Concluída": se há checklist de roteiro sem fazer,
 * pergunta (decisão do usuário: AVISA, não bloqueia). Falha ao consultar = segue.
 */
export async function confirmarConclusaoOS(osId: string): Promise<boolean> {
  try {
    const d = await chamarRoteiros<{ pendentes: string[] }>(osId)
    const msg = mensagemAvisoConclusao(d.pendentes || [])
    return msg ? window.confirm(msg) : true
  } catch {
    return true
  }
}
