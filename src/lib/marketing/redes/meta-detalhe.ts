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
