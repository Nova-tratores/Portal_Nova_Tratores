// =============================================================================
// Um post aberto na janela (25/11/2026, José: "quero clicar no post e ver as estatísticas dele, e ver o post também").
// Busca na hora, na Meta, tudo o que ela dá para aquele post + o endereço do vídeo para tocar ali mesmo.
// Testado com posts reais: Reels dão tempo médio assistido e repostagens; carrossel/foto dão visitas ao perfil e
// quem passou a seguir; no Facebook, vídeo dá tempo médio e quem assistiu 30 s.
// Cada métrica é pedida sozinha: a que a Meta recusar para aquele tipo de post simplesmente não aparece.
// =============================================================================
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'

const VERSAO = process.env.META_GRAPH_VERSION || 'v23.0'

export type Estat = { rotulo: string; valor: string; explica: string; icone: string }
export type PostAberto = { video: string | null; estatisticas: Estat[]; reacoes: { nome: string; valor: number }[] }

const n = (x: number) => x.toLocaleString('pt-BR')
const tempo = (ms: number) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} min`
}

async function g(caminho: string, q: Record<string, string>, tok: string) {
  const u = new URL(`https://graph.facebook.com/${VERSAO}/${caminho}`)
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
  u.searchParams.set('access_token', tok)
  const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } }
  if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`)
  return j
}

/** Valor de uma métrica de post (undefined = a Meta não dá essa para este post). */
async function metrica(id: string, m: string, tok: string, extra: Record<string, string> = {}): Promise<unknown> {
  try {
    const j = await g(`${id}/insights`, { metric: m, ...extra }, tok)
    const d = (j.data as { values?: { value: unknown }[]; total_value?: { value: unknown } }[])?.[0]
    return d?.values?.[0]?.value ?? d?.total_value?.value
  } catch { return undefined }
}

// Rótulo, explicação e formato de cada métrica (ordem = ordem na tela)
type Def = { m: string; rotulo: string; explica: string; icone: string; fmt?: (v: number) => string }
const IG: Def[] = [
  { m: 'views', rotulo: 'Visualizações', explica: 'Vezes que o post apareceu na tela (conta repetição)', icone: 'fa-eye' },
  { m: 'reach', rotulo: 'Alcance', explica: 'Contas diferentes que viram', icone: 'fa-bullhorn' },
  { m: 'likes', rotulo: 'Curtidas', explica: 'Corações no post', icone: 'fa-heart' },
  { m: 'comments', rotulo: 'Comentários', explica: 'Comentários no post', icone: 'fa-comment' },
  { m: 'shares', rotulo: 'Compartilhamentos', explica: 'Mandaram para alguém ou nos stories', icone: 'fa-paper-plane' },
  { m: 'saved', rotulo: 'Salvos', explica: 'Guardaram para ver depois', icone: 'fa-bookmark' },
  { m: 'reposts', rotulo: 'Repostagens', explica: 'Repostaram no próprio perfil', icone: 'fa-retweet' },
  { m: 'total_interactions', rotulo: 'Interações', explica: 'Curtidas + comentários + salvos + compartilhamentos', icone: 'fa-hand-pointer' },
  { m: 'ig_reels_avg_watch_time', rotulo: 'Tempo médio assistido', explica: 'Quanto cada pessoa ficou vendo, em média', icone: 'fa-stopwatch', fmt: tempo },
  { m: 'ig_reels_video_view_total_time', rotulo: 'Tempo total assistido', explica: 'Soma do tempo de todo mundo', icone: 'fa-hourglass-half', fmt: tempo },
  { m: 'profile_visits', rotulo: 'Visitas ao perfil', explica: 'Abriram o perfil da Nova a partir deste post', icone: 'fa-id-badge' },
  { m: 'follows', rotulo: 'Começaram a seguir', explica: 'Passaram a seguir por causa deste post', icone: 'fa-user-plus' },
]
const FB: Def[] = [
  { m: 'post_media_view', rotulo: 'Visualizações', explica: 'Vezes que o post apareceu na tela (conta repetição)', icone: 'fa-eye' },
  { m: 'post_total_media_view_unique', rotulo: 'Alcance', explica: 'Pessoas diferentes que viram', icone: 'fa-bullhorn' },
  { m: 'post_clicks', rotulo: 'Cliques', explica: 'Cliques em qualquer parte do post', icone: 'fa-arrow-pointer' },
  { m: 'post_video_views', rotulo: 'Vídeo assistido', explica: 'Vezes que o vídeo rodou por 3 s ou mais', icone: 'fa-play' },
  { m: 'post_video_complete_views_30s', rotulo: 'Assistiram 30 s', explica: 'Ficaram pelo menos 30 s (ou o vídeo todo)', icone: 'fa-film' },
  { m: 'post_video_avg_time_watched', rotulo: 'Tempo médio assistido', explica: 'Quanto cada pessoa ficou vendo, em média', icone: 'fa-stopwatch', fmt: tempo },
  { m: 'post_video_view_time', rotulo: 'Tempo total assistido', explica: 'Soma do tempo de todo mundo', icone: 'fa-hourglass-half', fmt: tempo },
]
const REACAO: Record<string, string> = { like: 'Curtir', love: 'Amei', wow: 'Uau', haha: 'Haha', sorry: 'Triste', anger: 'Grr', care: 'Força' }

export async function abrirPost(rede: 'instagram' | 'facebook', id: string): Promise<PostAberto | null> {
  const { data: conta } = await sb.from('site_redes_contas').select('conta_id, token').eq('rede', rede).maybeSingle()
  if (!conta?.token || !conta.conta_id) return null
  let tok = conta.token as string
  let video: string | null = null
  const reacoes: { nome: string; valor: number }[] = []

  if (rede === 'facebook') {
    const pg = await g(conta.conta_id as string, { fields: 'access_token' }, tok)
    tok = String(pg.access_token || tok)
    try {
      const j = await g(id, { fields: 'attachments{media_type,media{source}}' }, tok)
      const a = (j.attachments as { data?: { media_type?: string; media?: { source?: string } }[] } | undefined)?.data?.[0]
      if (a?.media?.source) video = a.media.source
    } catch { /* sem vídeo: mostra a foto */ }
    const r = await metrica(id, 'post_reactions_by_type_total', tok, { period: 'lifetime' })
    for (const [k, v] of Object.entries((r as Record<string, number>) || {})) if (Number(v) > 0) reacoes.push({ nome: REACAO[k] || k, valor: Number(v) })
    reacoes.sort((a, b) => b.valor - a.valor)
  } else {
    try {
      const j = await g(id, { fields: 'media_type,media_url' }, tok)
      if (j.media_type === 'VIDEO' && j.media_url) video = String(j.media_url)
    } catch { /* idem */ }
  }

  const defs = rede === 'facebook' ? FB : IG
  const valores = await Promise.all(defs.map((d) => metrica(id, d.m, tok, rede === 'facebook' ? { period: 'lifetime' } : {})))
  const estatisticas: Estat[] = []
  defs.forEach((d, i) => {
    const v = valores[i]
    if (typeof v !== 'number') return
    // tempo zerado em post que não é vídeo é só ruído
    if (d.fmt && v === 0) return
    if (rede === 'facebook' && d.m.startsWith('post_video') && !video) return
    estatisticas.push({ rotulo: d.rotulo, explica: d.explica, icone: d.icone, valor: d.fmt ? d.fmt(v) : n(v) })
  })
  if (rede === 'facebook') estatisticas.splice(2, 0, { rotulo: 'Reações', explica: 'Curtir, Amei, Uau…', icone: 'fa-thumbs-up', valor: n(reacoes.reduce((s, x) => s + x.valor, 0)) })
  return { video, estatisticas, reacoes }
}
