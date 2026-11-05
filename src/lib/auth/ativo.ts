// Conta desativada no /admin (financeiro_usu.ativo = false) não usa mais o portal.
//
// Antes o "desativar" só mudava a coluna: o token seguia aceito pelas rotas (auditoria
// 30/10/2026). As guardas do servidor (autenticar, protegerRota, exigirPermissao,
// exigirAcessoModulo, exigirSessao) chamam contaDesativada() depois de validar o token.
//
// Só `ativo === false` bloqueia: usuário sem linha em financeiro_usu (app dos mecânicos,
// app de vendas) continua passando. Falha ao ler o banco também deixa passar — a rota
// segue com as outras checagens, e o portal não cai inteiro por um select.
import { createClient } from '@supabase/supabase-js'

const CACHE_MS = 60_000

type Lido = { desativada: boolean; em: number }
const g = globalThis as unknown as { __contaAtivoCache?: Map<string, Lido> }
const cache = (g.__contaAtivoCache ??= new Map<string, Lido>())

export const MENSAGEM_DESATIVADA = 'conta desativada: fale com o administrador'

/** Regra pura: a linha de financeiro_usu manda bloquear? */
export function linhaDesativada(linha: { ativo?: unknown } | null | undefined): boolean {
  return linha?.ativo === false
}

function cliente() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function contaDesativada(userId: string, agora: number = Date.now()): Promise<boolean> {
  const c = cache.get(userId)
  if (c && agora - c.em < CACHE_MS) return c.desativada
  try {
    const { data, error } = await cliente().from('financeiro_usu').select('ativo').eq('id', userId).maybeSingle()
    if (error) return c?.desativada ?? false
    const desativada = linhaDesativada(data)
    cache.set(userId, { desativada, em: agora })
    return desativada
  } catch {
    return c?.desativada ?? false
  }
}

/** Chamado pelo /admin ao ativar/desativar: vale na hora, sem esperar o cache. */
export function esquecerConta(userId: string): void {
  cache.delete(userId)
}

/** Tira dos destinatários de aviso quem está desativado. */
export async function semDesativados(ids: string[]): Promise<string[]> {
  if (!ids.length) return ids
  try {
    const { data, error } = await cliente().from('financeiro_usu').select('id, ativo').in('id', ids)
    if (error) return ids
    const fora = new Set((data || []).filter((u) => linhaDesativada(u)).map((u) => String(u.id)))
    return ids.filter((id) => !fora.has(id))
  } catch {
    return ids
  }
}
