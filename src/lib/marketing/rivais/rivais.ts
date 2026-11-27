// =============================================================================
// Radar dos concorrentes no Instagram (27/11/2026). José: "preciso de uma engine ou robô inteligente para fazer
// métricas com o que eles postam e comparar com o nosso" · "a constância, quantidade de post por mês, feed e stories,
// insights".
//
// Como: a conta de Instagram da Nova (ligada pela Meta, site_redes_contas) usa o Business Discovery para ler perfis
// COMERCIAIS públicos. Vem: seguidores, total de posts e cada post (tipo, data, texto, curtidas, comentários, link).
// NÃO vem (a Meta não entrega de outra conta): stories, alcance, visualizações. Da Nova esses números já existem em
// Acessos; aqui a Nova entra com os mesmos dados públicos, para a comparação ser justa.
//
// Todo dia (agendador 'marketing-rivais', 06:30): coleta. Primeira vez de cada um: até 6 meses de posts.
// Segunda-feira: a IA (Claude) lê as métricas e os posts que mais deram resultado e escreve a análise da semana.
// =============================================================================
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'

const VERSAO = process.env.META_GRAPH_VERSION || 'v23.0'
export const MSG_SQL_RIVAIS = 'Radar não ativado: rode sql/marketing-concorrentes-instagram.sql no projeto do portal (citrhumdkfivdzbmayde).'
export const faltaTabelaRivais = (m: string) => /mkt_rivais|does not exist|schema cache/i.test(m)

export type Rival = { username: string; nome: string | null; tipo: 'nos' | 'marca' | 'revenda'; ativo: boolean; seguidores: number | null; posts_total: number | null; foto: string | null; erro: string | null; coletado_em: string | null }
export type PostRival = { id: string; username: string; quando: string; tipo: string | null; curtidas: number | null; comentarios: number | null; legenda: string | null; link: string | null; imagem: string | null }

const diaSP = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const TIPO: Record<string, string> = { CAROUSEL_ALBUM: 'CARROSSEL', IMAGE: 'FOTO', VIDEO: 'VIDEO' }
const tipoDo = (m: { media_type?: string; media_product_type?: string }) => (m.media_product_type === 'REELS' ? 'REELS' : TIPO[m.media_type || ''] || m.media_type || null)

async function contaNova(): Promise<{ id: string; token: string; username: string | null }> {
  const { data } = await sb.from('site_redes_contas').select('conta_id, token, nome').eq('rede', 'instagram').maybeSingle()
  if (!data?.token || !data.conta_id) throw new Error('O Instagram da Nova não está ligado (Conteúdo → Contas das redes).')
  return { id: String(data.conta_id), token: String(data.token), username: null }
}

async function graph(caminho: string, token: string, q: Record<string, string>) {
  const u = new URL(`https://graph.facebook.com/${VERSAO}/${caminho}`)
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v)
  u.searchParams.set('access_token', token)
  const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
  const j = (await r.json().catch(() => ({}))) as Record<string, any> & { error?: { message?: string } }
  if (!r.ok || j.error) throw new Error(j.error?.message || `HTTP ${r.status}`)
  return j
}

const CAMPOS_POST = 'id,caption,timestamp,media_type,media_product_type,like_count,comments_count,permalink,media_url,thumbnail_url'

/** Lê um perfil. `meses` = até quantos meses para trás buscar posts (paginando de 50 em 50, no máximo 8 páginas). */
async function lerPerfil(conta: { id: string; token: string }, username: string, meses: number) {
  const corte = Date.now() - meses * 31 * 864e5
  let depois = ''
  let perfil: Record<string, any> | null = null
  const posts: PostRival[] = []
  for (let pag = 0; pag < 8; pag++) {
    const media = `media${depois ? `.after(${depois})` : ''}.limit(50){${CAMPOS_POST}}`
    const j = await graph(conta.id, conta.token, { fields: `business_discovery.username(${username}){username,name,followers_count,media_count,profile_picture_url,${media}}` })
    const b = j.business_discovery
    perfil ??= b
    const lista = (b?.media?.data || []) as Record<string, any>[]
    for (const m of lista) posts.push({
      id: String(m.id), username, quando: m.timestamp, tipo: tipoDo(m),
      curtidas: typeof m.like_count === 'number' ? m.like_count : null, comentarios: typeof m.comments_count === 'number' ? m.comments_count : null,
      legenda: m.caption ? String(m.caption).slice(0, 2200) : null, link: m.permalink || null,
      imagem: m.media_type === 'VIDEO' ? m.thumbnail_url || null : m.media_url || m.thumbnail_url || null,
    })
    depois = b?.media?.paging?.cursors?.after || ''
    const ultimo = lista[lista.length - 1]
    if (!depois || !ultimo || new Date(ultimo.timestamp).getTime() < corte) break
  }
  return { perfil: perfil!, posts: posts.filter((p) => new Date(p.quando).getTime() >= corte) }
}

/** Coleta de todos os ativos. A Nova entra sozinha (tipo 'nos'). */
export async function coletarRivais(so?: string): Promise<{ resumo: string; erros: string[] }> {
  const conta = await contaNova()
  // a própria Nova: descobre o @ e garante a linha
  try {
    const eu = await graph(conta.id, conta.token, { fields: 'username,name' })
    if (eu.username) await sb.from('mkt_rivais').upsert({ username: eu.username, nome: eu.name || 'Nova Tratores', tipo: 'nos' }, { onConflict: 'username', ignoreDuplicates: true })
  } catch { /* segue sem a Nova */ }

  let q = sb.from('mkt_rivais').select('*').eq('ativo', true)
  if (so) q = q.eq('username', so)   // acabou de ser adicionado: lê só ele
  const { data, error } = await q
  if (error) throw new Error(faltaTabelaRivais(error.message) ? MSG_SQL_RIVAIS : error.message)
  const hoje = diaSP(new Date())
  const feitos: string[] = [], erros: string[] = []
  for (const r of (data || []) as Rival[]) {
    try {
      // primeira vez: 6 meses de história; depois, só o último mês (atualiza curtidas e pega os novos)
      const { perfil, posts } = await lerPerfil(conta, r.username, r.coletado_em ? 1 : 6)
      await sb.from('mkt_rivais').update({ nome: r.nome || perfil.name || null, seguidores: perfil.followers_count ?? null, posts_total: perfil.media_count ?? null,
        foto: perfil.profile_picture_url || null, erro: null, coletado_em: new Date().toISOString() }).eq('username', r.username)
      await sb.from('mkt_rivais_dia').upsert({ username: r.username, dia: hoje, seguidores: perfil.followers_count ?? null, posts_total: perfil.media_count ?? null }, { onConflict: 'username,dia' })
      for (let i = 0; i < posts.length; i += 100) {
        const { error: e } = await sb.from('mkt_rivais_posts').upsert(posts.slice(i, i + 100).map((p) => ({ ...p, atualizado_em: new Date().toISOString() })), { onConflict: 'id' })
        if (e) throw new Error(e.message)
      }
      // stories: só da Nova (de outra conta a Meta não entrega). Ficam no ar 24 h; a coleta diária pega todos.
      if (r.tipo === 'nos') {
        try {
          const st = await graph(`${conta.id}/stories`, conta.token, { fields: 'id,timestamp,media_type,permalink,media_url,thumbnail_url' })
          const lista = ((st.data || []) as Record<string, any>[]).map((m) => ({ id: String(m.id), username: r.username, quando: m.timestamp, tipo: 'STORY',
            curtidas: null, comentarios: null, legenda: null, link: m.permalink || null, imagem: m.thumbnail_url || m.media_url || null, atualizado_em: new Date().toISOString() }))
          if (lista.length) await sb.from('mkt_rivais_posts').upsert(lista, { onConflict: 'id' })
        } catch { /* sem permissão de stories: segue */ }
      }
      feitos.push(`${r.username} (${posts.length})`)
    } catch (e) {
      const m = (e as Error).message
      const amigavel = /Invalid user id|Cannot find User|does not exist/i.test(m) ? 'Não achei esse @, ou não é conta comercial/criador (perfil pessoal não abre).' : m.slice(0, 300)
      await sb.from('mkt_rivais').update({ erro: amigavel }).eq('username', r.username)
      erros.push(`${r.username}: ${amigavel}`)
    }
  }
  return { resumo: `${feitos.length} perfis lidos: ${feitos.join(', ')}`, erros }
}

// ---------------------------------------------------------------------------- métricas
export type Metricas = {
  username: string; nome: string | null; tipo: Rival['tipo']; foto: string | null; erro: string | null; coletado_em: string | null
  seguidores: number | null; cresc7: number | null; cresc30: number | null
  /** últimos 6 meses. stories: só da Nova (null nos concorrentes: a Meta não entrega), contados desde que o radar começou */
  porMes: { mes: string; feed: number; carrossel: number; reels: number; total: number; stories: number | null }[]
  posts30: number; porSemana: number
  /** % das últimas 12 semanas com pelo menos 1 post */
  constancia: number; diasEntrePosts: number | null; maiorPausa: number | null; diasSemPostar: number | null
  mix: { foto: number; carrossel: number; reels: number }   // % dos posts dos últimos 90 dias
  mediaCurtidas: number | null; mediaComentarios: number | null
  /** (curtidas + comentários) ÷ seguidores, por post, em % */
  engajamento: number | null
  engajamentoPorTipo: { tipo: string; media: number; n: number }[]
  melhorDia: string | null; melhorHora: string | null
  top: PostRival[]
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

export function calcular(r: Rival, posts: PostRival[], historico: { dia: string; seguidores: number | null }[]): Metricas {
  const agora = Date.now()
  const stories = posts.filter((p) => p.tipo === 'STORY')
  const ps = posts.filter((p) => p.tipo !== 'STORY').sort((a, b) => b.quando.localeCompare(a.quando))
  const desde = (dias: number) => ps.filter((p) => agora - new Date(p.quando).getTime() <= dias * 864e5)
  const p30 = desde(30), p90 = desde(90)

  // posts por mês (6 meses, do mais antigo ao atual)
  const porMes: Metricas['porMes'] = []
  const base = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const doMes = ps.filter((p) => diaSP(new Date(p.quando)).startsWith(mes))
    porMes.push({ mes, feed: doMes.filter((p) => p.tipo === 'FOTO').length, carrossel: doMes.filter((p) => p.tipo === 'CARROSSEL').length,
      reels: doMes.filter((p) => p.tipo === 'REELS' || p.tipo === 'VIDEO').length, total: doMes.length,
      stories: r.tipo === 'nos' ? stories.filter((p) => diaSP(new Date(p.quando)).startsWith(mes)).length : null })
  }

  // constância: semanas (últimas 12) com post; intervalo médio e maior pausa (90 dias)
  let semanasCom = 0
  for (let w = 0; w < 12; w++) if (ps.some((p) => { const t = agora - new Date(p.quando).getTime(); return t >= w * 7 * 864e5 && t < (w + 1) * 7 * 864e5 })) semanasCom++
  const intervalos: number[] = []
  for (let i = 0; i + 1 < p90.length; i++) intervalos.push((new Date(p90[i].quando).getTime() - new Date(p90[i + 1].quando).getTime()) / 864e5)

  const eng = (p: PostRival) => (p.curtidas ?? 0) + (p.comentarios ?? 0)
  const seg = r.seguidores || null
  const taxa = (xs: PostRival[]) => (seg && xs.length ? (media(xs.map(eng))! / seg) * 100 : null)
  const tipos = ['FOTO', 'CARROSSEL', 'REELS']
  const grupo = (t: string) => p90.filter((p) => (t === 'REELS' ? p.tipo === 'REELS' || p.tipo === 'VIDEO' : p.tipo === t))
  const pct = (n: number) => (p90.length ? Math.round((n / p90.length) * 100) : 0)

  // melhor dia/hora: média de engajamento (90 dias), só com 2+ posts no grupo
  const melhor = (chave: (p: PostRival) => string) => {
    const g = new Map<string, number[]>()
    for (const p of p90) g.set(chave(p), [...(g.get(chave(p)) || []), eng(p)])
    return [...g.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => media(b[1])! - media(a[1])!)[0]?.[0] || null
  }
  const local = (p: PostRival) => new Date(new Date(p.quando).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))

  const segDe = (dias: number) => {
    const alvo = diaSP(new Date(agora - dias * 864e5))
    const antes = historico.filter((h) => h.dia <= alvo && h.seguidores != null).sort((a, b) => b.dia.localeCompare(a.dia))[0]
    return antes && seg != null ? seg - (antes.seguidores as number) : null
  }

  return {
    username: r.username, nome: r.nome, tipo: r.tipo, foto: r.foto, erro: r.erro, coletado_em: r.coletado_em,
    seguidores: r.seguidores, cresc7: segDe(7), cresc30: segDe(30),
    porMes, posts30: p30.length, porSemana: Math.round((p90.length / (90 / 7)) * 10) / 10,
    constancia: Math.round((semanasCom / 12) * 100),
    diasEntrePosts: intervalos.length ? Math.round(media(intervalos)! * 10) / 10 : null,
    maiorPausa: intervalos.length ? Math.round(Math.max(...intervalos)) : null,
    diasSemPostar: ps[0] ? Math.floor((agora - new Date(ps[0].quando).getTime()) / 864e5) : null,
    mix: { foto: pct(grupo('FOTO').length), carrossel: pct(grupo('CARROSSEL').length), reels: pct(grupo('REELS').length) },
    mediaCurtidas: p30.length ? Math.round(media(p30.map((p) => p.curtidas ?? 0))!) : null,
    mediaComentarios: p30.length ? Math.round(media(p30.map((p) => p.comentarios ?? 0))! * 10) / 10 : null,
    engajamento: taxa(p30) != null ? Math.round(taxa(p30)! * 100) / 100 : null,
    engajamentoPorTipo: tipos.map((t) => ({ tipo: t, n: grupo(t).length, media: Math.round(media(grupo(t).map(eng)) ?? 0) })).filter((x) => x.n > 0),
    melhorDia: melhor((p) => DIAS[local(p).getDay()]),
    melhorHora: (() => { const h = melhor((p) => String(local(p).getHours())); return h ? `${h.padStart(2, '0')}h` : null })(),
    top: [...p30].sort((a, b) => eng(b) - eng(a)).slice(0, 6),
  }
}

/** Todas as métricas (para a tela e para a IA). */
export async function painelRivais() {
  const { data: rivais, error } = await sb.from('mkt_rivais').select('*').order('tipo').order('seguidores', { ascending: false, nullsFirst: false })
  if (error) throw new Error(faltaTabelaRivais(error.message) ? MSG_SQL_RIVAIS : error.message)
  const desde = new Date(Date.now() - 190 * 864e5).toISOString()
  const [{ data: posts }, { data: dias }, { data: analise }] = await Promise.all([
    sb.from('mkt_rivais_posts').select('*').gte('quando', desde).order('quando', { ascending: false }).limit(10000),
    sb.from('mkt_rivais_dia').select('username, dia, seguidores').gte('dia', diaSP(new Date(Date.now() - 40 * 864e5))),
    sb.from('mkt_rivais_analise').select('*').order('semana', { ascending: false }).limit(1).maybeSingle(),
  ])
  const lista = ((rivais || []) as Rival[]).map((r) => calcular(r,
    ((posts || []) as PostRival[]).filter((p) => p.username === r.username),
    ((dias || []) as { username: string; dia: string; seguidores: number | null }[]).filter((d) => d.username === r.username)))
  return { metricas: lista, rivais: (rivais || []) as Rival[], analise: analise as { semana: string; analise: Analise; criado_em: string } | null }
}

// ---------------------------------------------------------------------------- análise da IA
export type Analise = {
  resumo: string
  destaques: { quem: string; o_que: string }[]
  o_que_funciona: string[]
  nova_comparada: string
  ideias_para_nova: { ideia: string; por_que: string }[]
}
const MOLDE = {
  type: 'object', additionalProperties: false,
  required: ['resumo', 'destaques', 'o_que_funciona', 'nova_comparada', 'ideias_para_nova'],
  properties: {
    resumo: { type: 'string' },
    destaques: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quem', 'o_que'], properties: { quem: { type: 'string' }, o_que: { type: 'string' } } } },
    o_que_funciona: { type: 'array', items: { type: 'string' } },
    nova_comparada: { type: 'string' },
    ideias_para_nova: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['ideia', 'por_que'], properties: { ideia: { type: 'string' }, por_que: { type: 'string' } } } },
  },
} as const

const segundaDe = (d: Date) => { const x = new Date(`${diaSP(d)}T12:00:00-03:00`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10) }

export async function analisarRivais(): Promise<{ resumo: string }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('sem ANTHROPIC_API_KEY')
  const { metricas } = await painelRivais()
  const comDados = metricas.filter((m) => !m.erro && m.seguidores != null)
  if (comDados.length < 2) throw new Error('Ainda não há dados suficientes: rode a coleta primeiro.')
  const linha = (m: Metricas) => [
    `@${m.username} (${m.tipo === 'nos' ? 'A NOVA TRATORES' : m.tipo}) — ${m.nome}`,
    `seguidores ${m.seguidores} (7 dias: ${m.cresc7 ?? '?'}; 30 dias: ${m.cresc30 ?? '?'})`,
    `posts nos últimos 30 dias: ${m.posts30}; por semana: ${m.porSemana}; constância: ${m.constancia}% das semanas; maior pausa: ${m.maiorPausa ?? '?'} dias`,
    `por mês: ${m.porMes.map((x) => `${x.mes}=${x.total} (foto ${x.feed}, carrossel ${x.carrossel}, reels ${x.reels})`).join('; ')}`,
    `mix 90 dias: foto ${m.mix.foto}%, carrossel ${m.mix.carrossel}%, reels ${m.mix.reels}%`,
    `média por post (30 dias): ${m.mediaCurtidas} curtidas, ${m.mediaComentarios} comentários; engajamento ${m.engajamento}% dos seguidores`,
    `engajamento médio por tipo: ${m.engajamentoPorTipo.map((t) => `${t.tipo} ${t.media} (${t.n} posts)`).join(', ')}`,
    `melhor dia: ${m.melhorDia ?? '?'}; melhor hora: ${m.melhorHora ?? '?'}`,
    `posts que mais deram resultado:\n${m.top.slice(0, 4).map((p) => `  - ${p.quando.slice(0, 10)} ${p.tipo} ${p.curtidas}♥ ${p.comentarios}💬: ${(p.legenda || '').replace(/\s+/g, ' ').slice(0, 300)}`).join('\n')}`,
  ].join('\n')

  const ia = new Anthropic()
  const r = await ia.messages.create({
    model: process.env.MARKETING_IA_MODELO || 'claude-opus-5-5',
    max_tokens: 8000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: MOLDE as unknown as Record<string, unknown> } },
    system: `Você é analista de marketing digital da Nova Tratores, concessionária Mahindra em Piraju/SP (interior, produtor rural pequeno e médio).
Recebe as métricas públicas do Instagram dos concorrentes (marcas de tratores e revendas) e da própria Nova.
Escreva em português do Brasil, frases curtas e diretas, para um dono de empresa que não é do marketing. Sem jargão (se usar "engajamento", explique uma vez: curtidas e comentários por seguidor).
- resumo: 3 a 5 frases sobre o que aconteceu no último mês entre os concorrentes.
- destaques: 3 a 6 itens, um por concorrente que fez algo que vale olhar (campanha, lançamento, formato que bombou), citando números.
- o_que_funciona: 3 a 5 padrões que deram mais resultado (formato, assunto, dia, frequência).
- nova_comparada: 2 a 4 frases comparando a Nova com eles, com números, honesto. Lembre que marcas nacionais têm muito mais seguidores: compare taxa e constância, não tamanho.
- ideias_para_nova: 3 a 5 ideias práticas que a Nova consegue fazer com celular e a equipe dela, cada uma com o porquê.
Não invente número que não está nos dados.`,
    messages: [{ role: 'user', content: comDados.map(linha).join('\n\n') }],
  })
  if (r.stop_reason === 'refusal') throw new Error('a IA recusou a análise')
  const txt = r.content.find((b) => b.type === 'text')?.text
  if (!txt) throw new Error('a IA não respondeu')
  const analise = JSON.parse(txt) as Analise
  const custo = (r.usage.input_tokens * 5 + r.usage.output_tokens * 25) / 1e6
  const { error } = await sb.from('mkt_rivais_analise').upsert({ semana: segundaDe(new Date()), analise, custo_usd: Math.round(custo * 10000) / 10000, criado_em: new Date().toISOString() }, { onConflict: 'semana' })
  if (error) throw new Error(error.message)
  return { resumo: `análise da semana gravada (US$ ${custo.toFixed(3)})` }
}

/** O que o agendador roda todo dia: coleta; na segunda (ou se não há análise da semana), analisa. */
export async function rodarRadar(): Promise<{ resumo: string }> {
  const c = await coletarRivais()
  let extra = ''
  const segunda = segundaDe(new Date())
  const { data: ja } = await sb.from('mkt_rivais_analise').select('semana').eq('semana', segunda).maybeSingle()
  if (!ja && process.env.ANTHROPIC_API_KEY) {
    try { extra = ` · ${(await analisarRivais()).resumo}` } catch (e) { extra = ` · análise: ${(e as Error).message}` }
  }
  return { resumo: `${c.resumo}${c.erros.length ? ` · erros: ${c.erros.join(' | ')}` : ''}${extra}` }
}
