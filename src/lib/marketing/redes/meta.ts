// =============================================================================
// Instagram pela Meta (25/11/2026): botão "Ligar" + robô dos números.
//
// App da Meta "Portal Nova Tratores" (developers.facebook.com), modo NÃO publicado (só quem está em
// Funções do app consegue ligar). Login do Facebook para Empresas com a configuração "API do Instagram
// (login unificado)", compatível com o Login do Instagram: o token é de USUÁRIO DO SISTEMA e não expira.
//
// Variáveis no Railway: META_APP_ID, META_APP_SECRET, META_CONFIG_ID (opcional META_GRAPH_VERSION).
//
// Ligar:   /api/marketing/redes/meta/ligar devolve o endereço do login (com `state` assinado) →
//          a Meta devolve em /api/marketing/redes/meta/retorno?code=…&state=… → troca o código pelo token,
//          acha o Instagram e grava em site_redes_contas (o token nunca vai para o navegador).
// Números: coletarInstagram() grava um dia por linha em site_redes_metricas (alcance, visualizações,
//          interações, toques no link; seguidores só no último dia). Roda no agendador
//          ('marketing-redes-numeros', 06:30) e logo depois de ligar (30 dias para trás).
// =============================================================================
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'

const VERSAO = process.env.META_GRAPH_VERSION || 'v23.0'
export const PORTAL = (process.env.PORTAL_URL || 'https://portal.novatratores.com').replace(/\/$/, '')
/** Tem que ser IGUAL ao cadastrado no app da Meta (URL de redirecionamento). */
export const RETORNO = `${PORTAL}/api/marketing/redes/meta/retorno`

export function metaPronta(): boolean {
  return !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID)
}

// ----------------------------------------------------------------- state assinado
// O retorno chega SEM login (quem chama é a Meta). O `state` leva quem clicou e a hora, assinado com a
// chave secreta do app: ninguém forja um retorno nem reaproveita um velho (vale 15 min).
const assinar = (txt: string) => createHmac('sha256', process.env.META_APP_SECRET || '').update(txt).digest('base64url')

export function criarState(quem: string): string {
  const corpo = Buffer.from(JSON.stringify({ q: quem.slice(0, 80), t: Date.now(), n: randomBytes(6).toString('hex') })).toString('base64url')
  return `${corpo}.${assinar(corpo)}`
}

export function lerState(state: string | null): { quem: string } | null {
  if (!state || !process.env.META_APP_SECRET) return null
  const [corpo, ass] = state.split('.')
  if (!corpo || !ass) return null
  const a = Buffer.from(ass), b = Buffer.from(assinar(corpo))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const j = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as { q?: string; t?: number }
    if (!j.t || Date.now() - j.t > 15 * 60_000) return null
    return { quem: String(j.q || 'Portal') }
  } catch { return null }
}

export function urlDoLogin(quem: string): string {
  const p = new URLSearchParams({
    client_id: process.env.META_APP_ID || '',
    redirect_uri: RETORNO,
    config_id: process.env.META_CONFIG_ID || '',
    response_type: 'code',
    override_default_response_type: 'true',
    state: criarState(quem),
  })
  return `https://www.facebook.com/${VERSAO}/dialog/oauth?${p}`
}

// ----------------------------------------------------------------- chamadas à Graph API
/** Token do Login do Instagram começa com "IG" e fala com graph.instagram.com; o da Meta, com graph.facebook.com. */
const hostDo = (token: string) => (token.startsWith('IG') ? 'https://graph.instagram.com' : 'https://graph.facebook.com')

type Resp = Record<string, unknown> & { error?: { message?: string; code?: number } }

async function graph(token: string, caminho: string, params: Record<string, string> = {}): Promise<Resp> {
  const url = new URL(`${hostDo(token)}/${VERSAO}/${caminho.replace(/^\//, '')}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('access_token', token)
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  const j = (await r.json().catch(() => ({}))) as Resp
  if (!r.ok || j.error) throw new Error(`Meta: ${j.error?.message || `HTTP ${r.status}`}`)
  return j
}

/** Código do retorno → token. */
export async function trocarCodigo(code: string): Promise<{ token: string; expiraEm: string | null }> {
  const url = new URL(`https://graph.facebook.com/${VERSAO}/oauth/access_token`)
  url.searchParams.set('client_id', process.env.META_APP_ID || '')
  url.searchParams.set('client_secret', process.env.META_APP_SECRET || '')
  url.searchParams.set('redirect_uri', RETORNO)
  url.searchParams.set('code', code)
  const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  const j = (await r.json().catch(() => ({}))) as Resp & { access_token?: string; expires_in?: number }
  if (!r.ok || !j.access_token) throw new Error(`Meta não devolveu o acesso: ${j.error?.message || `HTTP ${r.status}`}`)
  return { token: j.access_token, expiraEm: j.expires_in ? new Date(Date.now() + j.expires_in * 1000).toISOString() : null }
}

type ContaIG = { id: string; username: string; seguidores: number | null }

async function perfil(token: string, id: string): Promise<ContaIG | null> {
  try {
    const j = await graph(token, id, { fields: 'id,username,followers_count' })
    return { id: String(j.id || id), username: String(j.username || ''), seguidores: typeof j.followers_count === 'number' ? j.followers_count : null }
  } catch { return null }
}

/**
 * Qual Instagram o token alcança. Tenta, em ordem:
 *  1. Login do Instagram: /me já é a conta.
 *  2. debug_token: as permissões instagram_* trazem os ids das contas autorizadas (target_ids).
 *  3. Páginas do Facebook com Instagram ligado (/me/accounts).
 */
export async function acharInstagram(token: string): Promise<ContaIG> {
  if (token.startsWith('IG')) {
    const j = await graph(token, 'me', { fields: 'user_id,username,followers_count' })
    return { id: String(j.user_id || j.id), username: String(j.username || ''), seguidores: typeof j.followers_count === 'number' ? j.followers_count : null }
  }
  const ids = new Set<string>()
  const paginas = new Set<string>()
  const falhas: string[] = []
  const tentar = async (nome: string, fn: () => Promise<void>) => { try { await fn() } catch (e) { falhas.push(`${nome}: ${(e as Error).message}`) } }

  // 1. debug_token: ids autorizados por permissão (Instagram direto, ou Páginas que levam ao Instagram)
  await tentar('debug_token', async () => {
    const app = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
    const url = new URL(`https://graph.facebook.com/${VERSAO}/debug_token`)
    url.searchParams.set('input_token', token)
    url.searchParams.set('access_token', app)
    const j = (await (await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })).json()) as
      { data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] }; error?: { message?: string } }
    if (j.error) throw new Error(j.error.message)
    for (const g of j.data?.granular_scopes || []) {
      if (g.scope.startsWith('instagram_')) for (const t of g.target_ids || []) ids.add(t)
      if (g.scope.startsWith('pages_')) for (const t of g.target_ids || []) paginas.add(t)
    }
  })
  // 2. Páginas do Facebook com Instagram ligado
  await tentar('me/accounts', async () => {
    const j = await graph(token, 'me/accounts', { fields: 'id,instagram_business_account{id}' })
    for (const p of (j.data as { id: string; instagram_business_account?: { id: string } }[]) || []) {
      if (p.instagram_business_account?.id) ids.add(p.instagram_business_account.id)
      paginas.add(p.id)
    }
  })
  for (const pg of paginas) await tentar(`página ${pg}`, async () => {
    const j = await graph(token, pg, { fields: 'instagram_business_account{id}' })
    const ig = (j.instagram_business_account as { id?: string } | undefined)?.id
    if (ig) ids.add(ig)
  })
  // 3. Login unificado: o Instagram mora no portfólio empresarial
  if (!ids.size) await tentar('portfólios', async () => {
    const j = await graph(token, 'me/businesses', { fields: 'id' })
    for (const b of (j.data as { id: string }[]) || []) {
      for (const borda of ['instagram_business_accounts', 'owned_instagram_accounts', 'client_instagram_accounts']) {
        await tentar(`${b.id}/${borda}`, async () => {
          const r = await graph(token, `${b.id}/${borda}`, { fields: 'id,username' })
          for (const a of (r.data as { id: string }[]) || []) ids.add(a.id)
        })
      }
    }
  })
  for (const id of ids) {
    const c = await perfil(token, id)
    if (c?.username) return c
  }
  console.warn('[meta] achar Instagram:', { ids: [...ids], paginas: [...paginas], falhas })
  throw new Error(`A Meta não mostrou o Instagram nessa autorização (${ids.size} id(s) achado(s)). ${falhas.slice(0, 3).join(' | ')}`.slice(0, 280))
}

// ----------------------------------------------------------------- números
/** "AAAA-MM-DD" do dia em Piraju (Brasil sem horário de verão: -03:00). */
const diaSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const unix = (dia: string, maisDias = 0) => Math.floor(new Date(`${dia}T00:00:00-03:00`).getTime() / 1000) + maisDias * 86400

/** Métrica → coluna. Cada uma é pedida sozinha: se a Meta recusar uma, as outras entram. */
const METRICAS = { reach: 'alcance', views: 'visualizacoes', total_interactions: 'interacoes', profile_links_taps: 'cliques' } as const

async function numerosDoDia(token: string, id: string, dia: string, erros: Set<string>) {
  const linha: Record<string, number | null> = {}
  for (const [m, col] of Object.entries(METRICAS)) {
    try {
      const j = await graph(token, `${id}/insights`, { metric: m, period: 'day', metric_type: 'total_value', since: String(unix(dia)), until: String(unix(dia, 1)) })
      const v = (j.data as { total_value?: { value?: number } }[] | undefined)?.[0]?.total_value?.value
      linha[col] = typeof v === 'number' ? v : 0
    } catch (e) { erros.add(`${m}: ${(e as Error).message}`) }
  }
  return linha
}

type PostDia = { id: string; link: string | null; titulo: string; views: null; curtidas: number; comentarios: number }

async function postsPorDia(token: string, id: string, desde: string): Promise<Map<string, PostDia[]>> {
  const mapa = new Map<string, PostDia[]>()
  try {
    const j = await graph(token, `${id}/media`, { fields: 'id,caption,permalink,timestamp,like_count,comments_count', since: String(unix(desde)), limit: '100' })
    for (const m of (j.data as Record<string, unknown>[]) || []) {
      const dia = diaSP(new Date(String(m.timestamp)))
      const l = mapa.get(dia) || []
      l.push({ id: String(m.id), link: (m.permalink as string) || null, titulo: String(m.caption || '').split('\n')[0].slice(0, 90),
        views: null, curtidas: Number(m.like_count) || 0, comentarios: Number(m.comments_count) || 0 })
      mapa.set(dia, l)
    }
  } catch { /* posts são extra: sem eles, os números do dia entram igual */ }
  return mapa
}

/** Grava os últimos `dias` dias (ontem para trás). Devolve um resumo para o agendador. */
export async function coletarInstagram(dias = 3): Promise<{ resumo: string; pulado?: string }> {
  const { data: conta, error } = await sb.from('site_redes_contas').select('conta_id, token, nome').eq('rede', 'instagram').maybeSingle()
  if (error) throw new Error(error.message)
  if (!conta?.token || !conta.conta_id) return { resumo: '', pulado: 'Instagram não ligado' }
  const { token, conta_id: id } = conta as { token: string; conta_id: string }

  const hoje = diaSP(new Date())
  const lista = Array.from({ length: dias }, (_, i) => diaSP(new Date(new Date(`${hoje}T12:00:00-03:00`).getTime() - (i + 1) * 864e5))).reverse()
  const ontem = lista[lista.length - 1]
  const [atual, posts] = await Promise.all([perfil(token, id), postsPorDia(token, id, lista[0])])
  const erros = new Set<string>()
  let gravados = 0
  for (const dia of lista) {
    const n = await numerosDoDia(token, id, dia, erros)
    if (!Object.keys(n).length) continue
    // uma linha por vez: assim o upsert só mexe nas colunas enviadas (seguidores só no último dia)
    const linha = { rede: 'instagram', dia, ...n, posts: posts.get(dia) || [], atualizado_em: new Date().toISOString(),
      ...(dia === ontem && atual?.seguidores != null ? { seguidores: atual.seguidores } : {}) }
    const { error: e } = await sb.from('site_redes_metricas').upsert(linha, { onConflict: 'rede,dia' })
    if (e) erros.add(e.message); else gravados++
  }
  if (!gravados && erros.size) throw new Error([...erros].slice(0, 3).join(' | '))
  const nome = (conta as { nome?: string }).nome || 'Instagram'
  return { resumo: `${nome}: ${gravados} dia(s) gravados${atual?.seguidores != null ? ` · ${atual.seguidores} seguidores` : ''}${erros.size ? ` · avisos: ${[...erros].slice(0, 2).join(' | ')}` : ''}` }
}
