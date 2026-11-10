// Módulo Site (Comercial) — servidor (José, 10/11/2026).
// Rotas públicas que o site chama (/api/publico/site/*) e as do portal (/api/site/*).
// Tabelas em sql/site-modulo.sql (projeto PORTAL). Sem a migration, as rotas respondem 503 com o aviso.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { protegerRota } from '@/lib/ajustes/permissao-server'

/** Endereço público do site (catalogo.json). */
export const SITE_URL = (process.env.SITE_URL || 'https://novatratores.com.br').replace(/\/$/, '')

/** Origens que podem chamar as rotas públicas (site em produção, staging e o localhost do desenvolvimento). */
function origensPermitidas(): string[] {
  const extra = (process.env.SITE_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)
  return [SITE_URL, SITE_URL.replace('://', '://www.'), 'http://localhost:4321', ...extra]
}

export function corsSite(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') || ''
  const ok = origensPermitidas().includes(origem)
  return {
    'Access-Control-Allow-Origin': ok ? origem : SITE_URL,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

/** Corpo JSON mandado como text/plain (o site evita a checagem prévia de CORS); limite de 8 KB. */
export async function lerCorpo<T>(req: Request): Promise<T | null> {
  const txt = await req.text().catch(() => '')
  if (!txt || txt.length > 8192) return null
  try { return JSON.parse(txt) as T } catch { return null }
}

/** Limite simples por IP na memória do processo (freio de spam, não segurança forte). */
const contagem = new Map<string, { n: number; ate: number }>()
export function passouLimite(req: Request, chave: string, max: number, janelaMs: number): boolean {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'sem-ip'
  const k = `${chave}|${ip}`
  const agora = Date.now()
  const c = contagem.get(k)
  if (!c || c.ate < agora) { contagem.set(k, { n: 1, ate: agora + janelaMs }); return false }
  c.n++
  if (contagem.size > 5000) for (const [kk, v] of contagem) if (v.ate < agora) contagem.delete(kk)
  return c.n > max
}

/** Tabela ausente (migration não rodada) → mensagem clara. */
export function semMigration(msg?: string): boolean {
  return /relation .*site_|does not exist|schema cache/i.test(msg || '')
}
export const AVISO_MIGRATION = 'Módulo Site não ativado: rode sql/site-modulo.sql no projeto do portal.'

/** Guarda das rotas do portal. tela = pedidos | catalogo | acessos; editar = ação de escrita. */
export async function guardarSite(req: Request, tela: 'pedidos' | 'catalogo' | 'acessos' | 'conteudo', editar = false) {
  return protegerRota(req, editar
    ? [{ modulo: 'site', acao: `${tela}:editar` }, { modulo: 'site', acao: tela }]
    : [{ modulo: 'site', acao: tela }])
}

/** Quem recebe o aviso de pedido novo: quem tem o módulo Site (inteiro ou a tela Pedidos). Sem ninguém, os admins. */
export async function usuariosDoSite(): Promise<string[]> {
  const { data } = await sb.from('portal_permissoes').select('user_id, is_admin, modulos_permitidos')
  const linhas = (data || []) as Array<{ user_id: string; is_admin: boolean | null; modulos_permitidos: string[] | null }>
  const doSite = linhas.filter((l) => (l.modulos_permitidos || []).some((m) => m === 'site' || m === 'site:pedidos')).map((l) => l.user_id)
  return doSite.length ? doSite : linhas.filter((l) => l.is_admin).map((l) => l.user_id)
}

export async function avisarPedido(ids: string[], titulo: string, descricao: string, link: string) {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return
  const { error } = await sb.from('portal_notificacoes').insert(unicos.map((user_id) => ({
    user_id, tipo: 'site', titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 1000), link,
  })))
  if (error) console.warn('[site] avisar:', error.message)
}

export { sb }
