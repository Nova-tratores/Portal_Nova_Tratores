'use client'
// Helper de cliente: monta o header Authorization com o token da sessão atual,
// pra mandar em chamadas fetch pras rotas que agora exigem login no servidor.
//
// Uso:
//   const res = await fetch('/api/...', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
//     body: ...,
//   })
import { supabase } from '@/lib/supabase'

export async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

// fetch com o token da sessão (atalho para quando a chamada só precisa do login)
export async function fetchAuth(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...((init.headers as Record<string, string>) || {}), ...(await authHeaders()) }
  return fetch(input, { ...init, headers })
}
