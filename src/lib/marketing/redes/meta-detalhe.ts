// =============================================================================
// Instagram ao vivo (25/11/2026): o que o painel do app mostra, lido na hora da Meta.
// Público (gênero, idade, cidades, países), visualizações por tipo, seguidores × não seguidores,
// quem começou/deixou de seguir, novos seguidores por dia e TODOS os posts com os números de cada um.
// Não grava nada: a Meta é a fonte (as miniaturas são links que vencem). Guarda 15 min na memória.
// Testado com a conta real em 25/11/2026 (todas as métricas abaixo responderam).
// =============================================================================
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'

const VERSAO = process.env.META_GRAPH_VERSION || 'v23.0'

type Par = { nome: string; valor: number }
export type PostIG = {
  id: string; tipo: string; quando: string; link: string | null; miniatura: string | null; legenda: string
  curtidas: number; comentarios: number; alcance: number | null; visualizacoes: number | null; salvos: number | null; compartilhamentos: number | null
}
export type DetalheIG = {
  conta: string; seguidores: number | null; dias: number; atualizadoEm: string
  visualizacoes: number | null; alcance: number | null
  porTipo: Par[]; visualizacoesSeguidor: Par[]; alcanceSeguidor: Par[]
  comecaram: number | null; deixaram: number | null
  novosPorDia: { dia: string; valor: number }[]
  genero: Par[]; idade: Par[]; cidades: Par[]; paises: Par[]
  posts: PostIG[]; avisos: string[]
}

const NOME_TIPO: Record<string, string> = { REEL: 'Reels', STORY: 'Stories', CAROUSEL_CONTAINER: 'Carrossel', POST: 'Posts', FEED: 'Posts', IGTV: 'Vídeos', AD: 'Anúncios' }
const NOME_SEGUE: Record<string, string> = { FOLLOWER: 'Seguidores', NON_FOLLOWER: 'Não seguidores', UNKNOWN: 'Sem saber' }
const NOME_GENERO: Record<string, string> = { M: 'Homens', F: 'Mulheres', U: 'Não informado' }
const nomePais = new Intl.DisplayNames(['pt-BR'], { type: 'region' })
const PAIS = new Proxy({} as Record<string, string>, { get: (_, k: string) => { try { return nomePais.of(k) || k } catch { return k } } })
const cidade = (c: string) => c.replace(/, ([^,]+) \(state\)$/, ' ($1)').replace('São Paulo (São Paulo)', 'São Paulo (capital)')

const cache = new Map<number, { ate: number; v: DetalheIG }>()

export async function detalheInstagram(dias: 7 | 30, forcar = false): Promise<DetalheIG | null> {
  const c = cache.get(dias)
  if (!forcar && c && c.ate > Date.now()) return c.v
  const { data: conta } = await sb.from('site_redes_contas').select('conta_id, token, nome').eq('rede', 'instagram').maybeSingle()
  if (!conta?.token || !conta.conta_id) return null
  const { token, conta_id: id } = conta as { token: string; conta_id: string; nome: string | null }
  const avisos: string[] = []

  const g = async (caminho: string, q: Record<string, string> = {}) => {
    const u = new URL(`https://graph.facebook.com/${VERSAO}/${caminho}`)
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
    u.searchParams.set('access_token', token)
    const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } }
    if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`)
    return j
  }
  /** total_value com quebra (breakdown) → lista [{nome, valor}] em ordem decrescente. */
  const quebra = async (rotulo: string, q: Record<string, string>, nome: (s: string) => string): Promise<{ total: number | null; lista: Par[] }> => {
    try {
      const j = await g(`${id}/insights`, { period: 'day', metric_type: 'total_value', ...q })
      const tv = (j.data as { total_value?: { value?: number; breakdowns?: { results?: { dimension_values: string[]; value: number }[] }[] } }[])?.[0]?.total_value
      const lista = (tv?.breakdowns?.[0]?.results || []).map((x) => ({ nome: nome(x.dimension_values[0]), valor: x.value })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor)
      return { total: typeof tv?.value === 'number' ? tv.value : null, lista }
    } catch (e) { avisos.push(`${rotulo}: ${(e as Error).message}`); return { total: null, lista: [] } }
  }

  const agora = Math.floor(Date.now() / 1000)
  const periodo = { since: String(agora - (dias - 1) * 86400), until: String(agora) }
  const demo = (b: string, nome: (s: string) => string) =>
    quebra(`público ${b}`, { metric: 'follower_demographics', period: 'lifetime', breakdown: b }, nome)

  const [perfil, porTipo, vSeg, aSeg, segue, genero, idade, cidades, paises, novos, midias] = await Promise.all([
    g(id, { fields: 'username,followers_count' }).catch(() => null),
    quebra('por tipo', { metric: 'views', breakdown: 'media_product_type', ...periodo }, (s) => NOME_TIPO[s] || s),
    quebra('visualizações por seguidor', { metric: 'views', breakdown: 'follow_type', ...periodo }, (s) => NOME_SEGUE[s] || s),
    quebra('alcance por seguidor', { metric: 'reach', breakdown: 'follow_type', ...periodo }, (s) => NOME_SEGUE[s] || s),
    quebra('seguir', { metric: 'follows_and_unfollows', breakdown: 'follow_type', ...periodo }, (s) => s),
    demo('gender', (s) => NOME_GENERO[s] || s),
    demo('age', (s) => s),
    demo('city', cidade),
    demo('country', (s) => PAIS[s] || s),
    g(`${id}/insights`, { metric: 'follower_count', period: 'day', ...periodo }).catch((e) => { avisos.push(`novos seguidores: ${(e as Error).message}`); return null }),
    g(`${id}/media`, { fields: 'id,caption,media_product_type,media_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count', limit: '50' })
      .catch((e) => { avisos.push(`posts: ${(e as Error).message}`); return null }),
  ])

  // Números de cada post (uma pergunta por post; os 50 mais recentes)
  const lista = ((midias?.data as Record<string, unknown>[]) || [])
  const posts: PostIG[] = await Promise.all(lista.map(async (m) => {
    const p: PostIG = {
      id: String(m.id), tipo: m.media_product_type === 'REELS' ? 'Reels' : m.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : m.media_type === 'VIDEO' ? 'Vídeo' : 'Foto',
      quando: String(m.timestamp), link: (m.permalink as string) || null,
      miniatura: (m.thumbnail_url as string) || (m.media_type !== 'VIDEO' ? (m.media_url as string) : null) || null,
      legenda: String(m.caption || ''), curtidas: Number(m.like_count) || 0, comentarios: Number(m.comments_count) || 0,
      alcance: null, visualizacoes: null, salvos: null, compartilhamentos: null,
    }
    try {
      const j = await g(`${p.id}/insights`, { metric: 'reach,views,saved,shares' })
      for (const x of (j.data as { name: string; values?: { value: number }[] }[]) || []) {
        const v = x.values?.[0]?.value ?? null
        if (x.name === 'reach') p.alcance = v
        if (x.name === 'views') p.visualizacoes = v
        if (x.name === 'saved') p.salvos = v
        if (x.name === 'shares') p.compartilhamentos = v
      }
    } catch { /* post antigo (antes da conta profissional) não tem números: fica só curtidas e comentários */ }
    return p
  }))

  const deSegue = (k: string) => segue.lista.find((x) => x.nome === k)?.valor ?? null
  const v: DetalheIG = {
    conta: perfil?.username ? `@${perfil.username}` : (conta as { nome?: string }).nome || 'Instagram',
    seguidores: typeof perfil?.followers_count === 'number' ? perfil.followers_count : null,
    dias, atualizadoEm: new Date().toISOString(),
    visualizacoes: vSeg.total ?? porTipo.total, alcance: aSeg.total,
    porTipo: porTipo.lista, visualizacoesSeguidor: vSeg.lista, alcanceSeguidor: aSeg.lista,
    // Na Meta, follows_and_unfollows vem com FOLLOWER = começaram a seguir e NON_FOLLOWER = deixaram de seguir
    comecaram: deSegue('FOLLOWER'), deixaram: deSegue('NON_FOLLOWER'),
    novosPorDia: ((novos?.data as { values?: { value: number; end_time: string }[] }[])?.[0]?.values || [])
      .map((x) => ({ dia: new Date(new Date(x.end_time).getTime() - 864e5).toISOString().slice(0, 10), valor: x.value })),
    genero: genero.lista, idade: idade.lista.sort((a, b) => a.nome.localeCompare(b.nome)), cidades: cidades.lista.slice(0, 15), paises: paises.lista.slice(0, 8),
    posts, avisos,
  }
  cache.set(dias, { ate: Date.now() + 15 * 60_000, v })
  return v
}

// =============================================================================
// Facebook (Página) ao vivo, 25/11/2026. José: "quero os antigos posts também".
// Testado com a Página real: published_posts traz TODOS os posts (desde 2022) sem pedir permissão nova;
// reações e comentários direto no post pedem pages_read_user_content, então as reações vêm pelo
// insights do post (post_reactions_by_type_total) e os comentários ficam de fora por enquanto.
// =============================================================================
export type PostFB = {
  id: string; tipo: string; quando: string; link: string | null; miniatura: string | null; legenda: string
  visualizacoes: number | null; alcance: number | null; reacoes: number | null; cliques: number | null
  compartilhamentos: number; videoViews: number | null
}
export type DetalheFB = {
  conta: string; seguidores: number | null; dias: number; atualizadoEm: string
  visualizacoes: number | null; alcance: number | null; interacoes: number | null; visitas: number | null; videoViews: number | null
  deSeguidores: Par[]; deAnuncio: Par[]
  comecaram: number | null; deixaram: number | null
  viewsPorDia: { dia: string; valor: number }[]; novosPorDia: { dia: string; valor: number }[]
  posts: PostFB[]; avisos: string[]
}

const TIPO_FB: Record<string, string> = { photo: 'Foto', video: 'Vídeo', album: 'Álbum', link: 'Link', share: 'Compartilhado', event: 'Evento' }
const cacheFB = new Map<number, { ate: number; v: DetalheFB }>()

export async function detalheFacebook(dias: 7 | 28, forcar = false): Promise<DetalheFB | null> {
  const c = cacheFB.get(dias)
  if (!forcar && c && c.ate > Date.now()) return c.v
  const { data: conta } = await sb.from('site_redes_contas').select('conta_id, token, nome').eq('rede', 'facebook').maybeSingle()
  if (!conta?.token || !conta.conta_id) return null
  const id = conta.conta_id as string
  const avisos: string[] = []

  const g = async (caminho: string, q: Record<string, string>, tok: string) => {
    const proxima = caminho.startsWith('http')   // "paging.next" da Meta já vem com o token dentro
    const u = new URL(proxima ? caminho : `https://graph.facebook.com/${VERSAO}/${caminho}`)
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
    if (!proxima) u.searchParams.set('access_token', tok)
    const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } }
    if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`)
    return j
  }
  // Os números da Página só saem com o token DA PÁGINA
  const pg = await g(id, { fields: 'access_token,name,followers_count' }, conta.token as string)
  const tok = String(pg.access_token || conta.token)

  const agora = Math.floor(Date.now() / 1000)
  const periodo = { period: 'day', since: String(agora - dias * 86400), until: String(agora) }
  type Val = { value: number; end_time: string } & Record<string, unknown>
  const serie = async (metric: string, extra: Record<string, string> = {}): Promise<Val[]> => {
    try {
      const j = await g(`${id}/insights`, { metric, ...periodo, ...extra }, tok)
      return ((j.data as { values?: Val[] }[]) || []).flatMap((x) => x.values || [])
    } catch (e) { avisos.push(`${metric}: ${(e as Error).message}`); return [] }
  }
  const soma = (l: Val[]) => (l.length ? l.reduce((s, x) => s + (Number(x.value) || 0), 0) : null)
  const porDia = (l: Val[]) => l.map((x) => ({ dia: new Date(new Date(x.end_time).getTime() - 864e5).toISOString().slice(0, 10), valor: Number(x.value) || 0 }))
  // Quebra (is_from_followers / is_from_ads): "1" e "0" viram nomes
  const quebra = (l: Val[], campo: string, sim: string, nao: string): Par[] => {
    const t: Record<string, number> = { [sim]: 0, [nao]: 0 }
    for (const x of l) t[String(x[campo]) === '1' ? sim : nao] += Number(x.value) || 0
    return Object.entries(t).map(([nome, valor]) => ({ nome, valor })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor)
  }
  // Alcance não se soma dia a dia (a mesma pessoa contaria várias vezes): a Meta dá o do período pronto
  const alcanceDoPeriodo = async () => {
    try {
      const j = await g(`${id}/insights`, { metric: 'page_total_media_view_unique', period: dias === 7 ? 'week' : 'days_28' }, tok)
      const v = ((j.data as { values?: Val[] }[])?.[0]?.values || []).at(-1)?.value
      return typeof v === 'number' ? v : null
    } catch (e) { avisos.push(`alcance: ${(e as Error).message}`); return null }
  }

  // Todos os posts (páginas de 100, até 500)
  const todosPosts = async () => {
    const lista: Record<string, unknown>[] = []
    try {
      let j = await g(`${id}/published_posts`, { fields: 'id,created_time,message,permalink_url,full_picture,status_type,shares,attachments{media_type}', limit: '100' }, tok)
      lista.push(...((j.data as Record<string, unknown>[]) || []))
      for (let i = 0; i < 4 && (j.paging as { next?: string } | undefined)?.next; i++) {
        j = await g((j.paging as { next: string }).next, {}, tok)
        lista.push(...((j.data as Record<string, unknown>[]) || []))
      }
    } catch (e) { avisos.push(`posts: ${(e as Error).message}`) }
    return lista
  }

  const [views, alcance, engaj, visitas, videos, deSeg, deAds, novos, perdidos, lista] = await Promise.all([
    serie('page_media_view'), alcanceDoPeriodo(), serie('page_post_engagements'), serie('page_views_total'), serie('page_video_views'),
    serie('page_media_view', { breakdown: 'is_from_followers' }), serie('page_media_view', { breakdown: 'is_from_ads' }),
    serie('page_daily_follows_unique'), serie('page_daily_unfollows_unique'), todosPosts(),
  ])

  // Números de cada post, de 20 em 20 para não afogar a Meta
  const posts: PostFB[] = []
  for (let i = 0; i < lista.length; i += 20) {
    posts.push(...(await Promise.all(lista.slice(i, i + 20).map(async (m) => {
      const tipo = ((m.attachments as { data?: { media_type?: string }[] } | undefined)?.data?.[0]?.media_type) || String(m.status_type || '')
      const p: PostFB = {
        id: String(m.id), tipo: TIPO_FB[tipo] || (tipo.includes('video') ? 'Vídeo' : 'Post'), quando: String(m.created_time),
        link: (m.permalink_url as string) || null, miniatura: (m.full_picture as string) || null, legenda: String(m.message || ''),
        visualizacoes: null, alcance: null, reacoes: null, cliques: null,
        compartilhamentos: Number((m.shares as { count?: number } | undefined)?.count) || 0, videoViews: null,
      }
      try {
        const j = await g(`${p.id}/insights`, { metric: 'post_media_view,post_total_media_view_unique,post_clicks,post_reactions_by_type_total,post_video_views', period: 'lifetime' }, tok)
        // period=lifetime: sem ele a Meta manda também o valor do DIA (0) depois do total, e o 0 ficava
        for (const x of (j.data as { name: string; values?: { value: unknown }[] }[]) || []) {
          const v = x.values?.[0]?.value
          if (x.name === 'post_media_view') p.visualizacoes = Number(v) || 0
          if (x.name === 'post_total_media_view_unique') p.alcance = Number(v) || 0
          if (x.name === 'post_clicks') p.cliques = Number(v) || 0
          if (x.name === 'post_video_views' && p.tipo === 'Vídeo') p.videoViews = Number(v) || 0
          if (x.name === 'post_reactions_by_type_total') p.reacoes = Object.values((v as Record<string, number>) || {}).reduce((s, n) => s + (Number(n) || 0), 0)
        }
      } catch { /* sem números: fica só o post */ }
      return p
    }))))
  }

  const v: DetalheFB = {
    conta: String(pg.name || conta.nome || 'Página'),
    seguidores: typeof pg.followers_count === 'number' ? pg.followers_count : null,
    dias, atualizadoEm: new Date().toISOString(),
    visualizacoes: soma(views), alcance, interacoes: soma(engaj), visitas: soma(visitas), videoViews: soma(videos),
    deSeguidores: quebra(deSeg, 'is_from_followers', 'Seguidores', 'Não seguidores'),
    deAnuncio: quebra(deAds, 'is_from_ads', 'Anúncio pago', 'Orgânico (sem pagar)'),
    comecaram: soma(novos), deixaram: soma(perdidos),
    viewsPorDia: porDia(views), novosPorDia: porDia(novos),
    posts, avisos,
  }
  cacheFB.set(dias, { ate: Date.now() + 15 * 60_000, v })
  return v
}
