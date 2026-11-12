// Calendário de conteúdo das redes (José, 12/11/2026: "um calendário de conteúdo, pronto para no mínimo 1 mês
// adiantado"; "publicar do portal para essas redes, escolhendo onde a publicação sai, se é só em uma ou em todas").
// GET ?de=AAAA-MM-DD&ate=AAAA-MM-DD → posts no período + ideias sem data + contas ligadas (sem token).
// POST cria · PATCH muda · DELETE ?id= apaga (o que já saiu nas redes não é apagado lá).
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/site/server'
import { STATUS_POST, ehRede, type Arte } from '@/lib/site/redes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_SQL = 'Rode sql/site-redes.sql no projeto do portal (citrhumdkfivdzbmayde).'
const falta = (m: string) => /site_posts|site_redes|does not exist|schema cache/i.test(m)
type Linha = Record<string, unknown>
const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('site') || u.modulos.includes('site:conteudo:editar')

function limpar(b: Linha): { ok: true; v: Linha } | { ok: false; erro: string } {
  const v: Linha = {}
  const t = (x: unknown, n: number) => { const s = String(x ?? '').trim().slice(0, n); return s || null }
  if ('titulo' in b) { v.titulo = t(b.titulo, 120); if (!v.titulo) return { ok: false, erro: 'Escreva do que é o post' } }
  if ('legenda' in b) v.legenda = t(b.legenda, 5000)
  if ('notas' in b) v.notas = t(b.notas, 1000)
  if ('redes' in b) v.redes = (Array.isArray(b.redes) ? b.redes : []).filter(ehRede).filter((x, i, a) => a.indexOf(x) === i)
  if ('formato' in b) v.formato = ['feed', 'reels', 'story', 'video'].includes(String(b.formato)) ? b.formato : 'feed'
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
  return NextResponse.json({
    ok: true, posts: noPeriodo.data || [], ideias: ideias.data || [], contas: contas.data || [], podeEditar: podeEditar(g.user),
    metaConfigurada: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
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
  const { data, error } = await sb.from('site_posts').insert({ ...l.v, criado_por: por, atualizado_por: por }).select('*').single()
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
  const { data, error } = await sb.from('site_posts')
    .update({ ...l.v, atualizado_em: new Date().toISOString(), atualizado_por: g.user.nome || g.user.email || 'Portal' })
    .eq('id', id).select('*').single()
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
