// Calendário de conteúdo das redes (José, 12/11/2026: "um calendário de conteúdo, pronto para no mínimo 1 mês
// adiantado"; "publicar do portal para essas redes, escolhendo onde a publicação sai, se é só em uma ou em todas").
// GET ?de=AAAA-MM-DD&ate=AAAA-MM-DD → posts no período + ideias sem data + contas ligadas (sem token).
// POST cria · PATCH muda · DELETE ?id= apaga (o que já saiu nas redes não é apagado lá).
import { NextResponse } from 'next/server'
import { guardarSite, sb, SITE_URL } from '@/lib/marketing/redes/server'
import { STATUS_POST, ehRede, type Arte } from '@/lib/marketing/redes/redes'
import { TIPOS_POST, FORMATOS_POST, GANCHOS, etiquetasFaltando, gerarCodigo, numeroWhats } from '@/lib/marketing/redes/etiquetas'

/** Fase 4 (23/11/2026): post que sai (não é mais ideia) precisa das etiquetas — é o que permite comparar depois. */
function semEtiqueta(final: Record<string, unknown>): string | null {
  if (!final.status || final.status === 'ideia') return null
  const f = etiquetasFaltando(final as never)
  return f.length ? `Antes de deixar o post pronto, marque: ${f.join(', ')}.` : null
}

/** Colunas novas (sql/marketing-fase4.sql e sql/marketing-fase3.sql). Enquanto o SQL não roda, o post grava sem elas. */
const COLUNAS_FASE4 = ['etiqueta_tipo', 'gente_real', 'maquina', 'gancho', 'codigo', 'acao_id',
  'textos', 'primeiro_comentario', 'hashtags', 'titulo_youtube', 'aprovado_por', 'aprovado_em']
const faltaColunaFase4 = (msg: string) => COLUNAS_FASE4.some((c) => msg.includes(c))
const semFase4 = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter(([k]) => !COLUNAS_FASE4.includes(k)))

/** WhatsApp da empresa para o link do post: o gravado em Textos do site, senão o texto do site. */
async function whatsDaEmpresa(): Promise<string | null> {
  try {
    const { data } = await sb.from('site_conteudo').select('valor').eq('grupo', 'contato').maybeSingle()
    const salvo = numeroWhats((data?.valor as Record<string, unknown> | null)?.whatsapp)
    if (salvo) return salvo
    const r = await fetch(`${SITE_URL}/conteudo-padrao.json`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    const j = await r.json()
    return numeroWhats(j?.padrao?.contato?.whatsapp)
  } catch { return null }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_SQL = 'Rode sql/site-redes.sql no projeto do portal (citrhumdkfivdzbmayde).'
const falta = (m: string) => /site_posts|site_redes|does not exist|schema cache/i.test(m)
type Linha = Record<string, unknown>
const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:conteudo:editar')
/** Fase 3.5 (23/11/2026): quem aprova post de preço/condição — admin ou a permissão dada na tela de permissões. */
const podeAprovar = (u: { isAdmin: boolean; modulos: string[] }) => u.isAdmin || u.modulos.includes('marketing:conteudo:aprovar')
/** Post de preço/condição precisa de aprovação antes de sair. */
const precisaAprovar = (p: Linha) => p.etiqueta_tipo === 'promocao'

function limpar(b: Linha): { ok: true; v: Linha } | { ok: false; erro: string } {
  const v: Linha = {}
  const t = (x: unknown, n: number) => { const s = String(x ?? '').trim().slice(0, n); return s || null }
  if ('titulo' in b) { v.titulo = t(b.titulo, 120); if (!v.titulo) return { ok: false, erro: 'Escreva do que é o post' } }
  if ('legenda' in b) v.legenda = t(b.legenda, 5000)
  if ('notas' in b) v.notas = t(b.notas, 1000)
  if ('redes' in b) v.redes = (Array.isArray(b.redes) ? b.redes : []).filter(ehRede).filter((x, i, a) => a.indexOf(x) === i)
  if ('formato' in b) v.formato = FORMATOS_POST.some((f) => f.id === b.formato) ? b.formato : 'feed'
  // Fase 4 (23/11/2026): etiquetas de seleção rápida + campanha ligada (sql/marketing-fase4.sql)
  if ('etiqueta_tipo' in b) v.etiqueta_tipo = TIPOS_POST.some((x) => x.id === b.etiqueta_tipo) ? b.etiqueta_tipo : null
  if ('gancho' in b) v.gancho = GANCHOS.some((x) => x.id === b.gancho) ? b.gancho : null
  if ('gente_real' in b) v.gente_real = typeof b.gente_real === 'boolean' ? b.gente_real : null
  if ('maquina' in b) v.maquina = t(b.maquina, 120)
  // Fase 3.2: texto ajustado por rede (vazio = usa o texto único), primeiro comentário, hashtags, título do YouTube
  if ('textos' in b) {
    const o: Linha = {}
    for (const [k, x] of Object.entries((b.textos || {}) as Linha)) { if (!ehRede(k)) continue; const s = t(x, 5000); if (s) o[k] = s }
    v.textos = o
  }
  if ('primeiro_comentario' in b) v.primeiro_comentario = t(b.primeiro_comentario, 2200)
  if ('hashtags' in b) v.hashtags = t(String(b.hashtags ?? '').split(/[\s,]+/).filter(Boolean).map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '), 500)
  if ('titulo_youtube' in b) v.titulo_youtube = t(b.titulo_youtube, 100)
  if ('acao_id' in b) v.acao_id =/^[0-9a-f-]{36}$/i.test(String(b.acao_id || '')) ? b.acao_id : null
  if ('midia' in b) {
    const m = (b.midia || {}) as Linha
    const out: Partial<Record<Arte, string>> = {}
    for (const a of ['site', 'feed', 'vertical', 'video'] as Arte[]) {
      const u = t(m[a], 600)
      if (u && !/^https:\/\//.test(u)) return { ok: false, erro: 'Arquivo inválido' }
      if (u) out[a] = u
    }
    v.midia = out
  }
  if ('quando' in b) {
    if (!b.quando) v.quando = null
    else { const d = new Date(String(b.quando)); if (isNaN(d.getTime())) return { ok: false, erro: 'Data inválida' }; v.quando = d.toISOString() }
  }
  if ('status' in b) { if (!(String(b.status) in STATUS_POST)) return { ok: false, erro: 'Situação inválida' }; v.status = b.status }
  if ('promocao_id' in b) v.promocao_id = t(b.promocao_id, 40)
  // "Já postei" (pelo celular) ou o robô: por rede { ok, link, em, manual }
  if ('resultado' in b) {
    const r = (b.resultado || {}) as Linha
    const out: Linha = {}
    for (const [k, x] of Object.entries(r)) {
      if (!ehRede(k) || !x || typeof x !== 'object') continue
      const o = x as Linha
      const link = t(o.link, 600)
      out[k] = { ok: o.ok === true, link: link && /^https:\/\//.test(link) ? link : null, em: t(o.em, 40) || new Date().toISOString(), manual: o.manual === true, erro: t(o.erro, 500) }
    }
    v.resultado = out
  }
  return { ok: true, v }
}

export async function GET(req: Request) {
  const g = await guardarSite(req, 'conteudo')
  if (g.resposta) return g.resposta
  const q = new URL(req.url).searchParams
  const de = q.get('de') || new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const ate = q.get('ate') || new Date(Date.now() + 62 * 864e5).toISOString().slice(0, 10)
  const [noPeriodo, ideias, contas] = await Promise.all([
    sb.from('site_posts').select('*').gte('quando', `${de}T00:00:00-03:00`).lte('quando', `${ate}T23:59:59-03:00`).order('quando'),
    sb.from('site_posts').select('*').is('quando', null).order('criado_em', { ascending: false }).limit(100),
    sb.from('site_redes_contas').select('rede, nome, conta_id, expira_em, ligado_por, atualizado_em'),
  ])
  const erro = noPeriodo.error || ideias.error
  if (erro) return NextResponse.json({ ok: false, erro: falta(erro.message) ? MSG_SQL : erro.message }, { status: falta(erro.message) ? 503 : 500 })
  // Fase 4.3: quantos contatos cada post trouxe (conversas que começaram com o código dele)
  const todos = [...(noPeriodo.data || []), ...(ideias.data || [])] as Linha[]
  const cods = todos.map((p) => p.codigo).filter(Boolean) as string[]
  if (cods.length) {
    const { data: cs } = await sb.from('mkt_conversas_lidas').select('codigo').in('codigo', cods)   // sem a tabela: segue sem contar
    const n = new Map<string, number>()
    for (const c of (cs || []) as { codigo: string }[]) n.set(c.codigo, (n.get(c.codigo) || 0) + 1)
    for (const p of todos) if (p.codigo) p.contatos = n.get(String(p.codigo)) || 0
  }
  return NextResponse.json({
    ok: true, posts: noPeriodo.data || [], ideias: ideias.data || [], contas: contas.data || [], podeEditar: podeEditar(g.user),
    whatsapp: await whatsDaEmpresa(), siteUrl: SITE_URL, podeAprovar: podeAprovar(g.user),
    metaConfigurada: !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID),
    metaFacebook: !!(process.env.META_APP_ID && process.env.META_APP_SECRET && process.env.META_CONFIG_ID_FACEBOOK),
  })
}

export async function POST(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as Linha
  const l = limpar({ titulo: '', ...b })
  if (!l.ok) return NextResponse.json({ ok: false, erro: l.erro }, { status: 400 })
  const por = g.user.nome || g.user.email || 'Portal'
  const faltaEtq = semEtiqueta(l.v)
  if (faltaEtq) return NextResponse.json({ ok: false, erro: faltaEtq }, { status: 400 })
  // código curto do post (Fase 4): sorteia de novo se por acaso repetir (coluna única)
  let data: Linha | null = null
  let error: { message: string } | null = null
  for (let i = 0; i < 4; i++) {
    const codigo = gerarCodigo(String(l.v.maquina || l.v.titulo || ''))
    ;({ data, error } = await sb.from('site_posts').insert({ ...l.v, codigo, criado_por: por, atualizado_por: por }).select('*').single())
    if (!error || !/duplicate|unique/i.test(error.message)) break
  }
  // sql/marketing-fase4.sql ainda não rodou: grava sem as colunas novas (o post não pode deixar de ser criado)
  if (error && faltaColunaFase4(error.message)) ({ data, error } = await sb.from('site_posts').insert({ ...semFase4(l.v), criado_por: por, atualizado_por: por }).select('*').single())
  if (error) return NextResponse.json({ ok: false, erro: falta(error.message) ? MSG_SQL : error.message }, { status: 500 })
  return NextResponse.json({ ok: true, post: data })
}

export async function PATCH(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as Linha
  const id = String(b.id || '')
  if (!id) return NextResponse.json({ ok: false, erro: 'post inválido' }, { status: 400 })
  const l = limpar(b)
  if (!l.ok) return NextResponse.json({ ok: false, erro: l.erro }, { status: 400 })
  const { data: atual } = await sb.from('site_posts').select('*').eq('id', id).maybeSingle()
  const faltaEtq = semEtiqueta({ ...((atual as Linha | null) || {}), ...l.v })
  if (faltaEtq) return NextResponse.json({ ok: false, erro: faltaEtq }, { status: 400 })
  const a = (atual || {}) as Linha
  const final = { ...a, ...l.v }
  // Fase 3.5: aprovação de post de preço/condição
  if (b.aprovar === true || b.aprovar === false) {
    if (!podeAprovar(g.user)) return NextResponse.json({ ok: false, erro: 'Só quem tem a permissão "aprovar post" aprova.' }, { status: 403 })
    l.v.aprovado_por = b.aprovar ? (g.user.nome || g.user.email || 'Portal') : null
    l.v.aprovado_em = b.aprovar ? new Date().toISOString() : null
  } else if (precisaAprovar(final) && a.aprovado_em) {
    // mudou o que vai para as redes depois de aprovado: precisa aprovar de novo
    const mexeu = ['legenda', 'textos', 'midia', 'titulo', 'hashtags', 'primeiro_comentario'].some((k) => k in l.v && JSON.stringify(l.v[k] ?? null) !== JSON.stringify(a[k] ?? null))
    if (mexeu) { l.v.aprovado_por = null; l.v.aprovado_em = null }
  }
  if (precisaAprovar(final) && 'aprovado_em' in a && !('aprovado_em' in l.v ? l.v.aprovado_em : a.aprovado_em)) {
    const antes = (a.resultado || {}) as Record<string, { ok?: boolean }>
    const depois = ('resultado' in l.v ? l.v.resultado : antes) as Record<string, { ok?: boolean }>
    if (Object.entries(depois || {}).some(([k, x]) => x?.ok && !antes?.[k]?.ok)) {
      return NextResponse.json({ ok: false, erro: 'Post de preço ou condição precisa ser aprovado antes de sair. Peça para quem aprova.' }, { status: 400 })
    }
  }
  // post de antes da Fase 4 ganha código na primeira edição
  // ('codigo' in a = a coluna existe; sem o SQL da Fase 4 não tenta gravar)
  if (atual && 'codigo' in a && !a.codigo) l.v.codigo = gerarCodigo(String(l.v.maquina || a.maquina || l.v.titulo || a.titulo || ''))
  const mudar = (v: Linha) => sb.from('site_posts')
    .update({ ...v, atualizado_em: new Date().toISOString(), atualizado_por: g.user.nome || g.user.email || 'Portal' })
    .eq('id', id).select('*').single()
  let { data, error } = await mudar(l.v)
  if (error && faltaColunaFase4(error.message)) ({ data, error } = await mudar(semFase4(l.v)))
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, post: data })
}

export async function DELETE(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const { error } = await sb.from('site_posts').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
