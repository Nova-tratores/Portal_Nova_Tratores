// Marcas do site (portal, Site → Catálogo → Marcas). José, 12/11/2026: "colocar uma nova marca, ou incluir modelos
// dentro de uma; pede a imagem do banner e tudo mais que é necessário e vai mostrando a prévia".
// GET: marcas que o site conhece (catalogo.json → marcas) + as gravadas aqui. PUT grava uma marca. DELETE apaga a
// gravação daqui (marca do código volta ao que era; marca nova some). Aparece no site depois do Publicar.
import { NextResponse } from 'next/server'
import { SITE_URL, fotosDoSite, guardarSite, sb } from '@/lib/marketing/redes/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MSG_SQL = 'Rode a parte "4) Marcas" de sql/site-produtos-promocoes.sql no projeto do portal (citrhumdkfivdzbmayde).'
const falta = (m: string) => /site_marcas|does not exist|schema cache/i.test(m)
const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('marketing') || u.modulos.includes('marketing:catalogo:editar')

type MarcaSite = { nome: string; slug?: string; logo_url?: string | null; banner_url?: string | null; sobre?: string | null; sob_consulta?: string[]; modelos?: number; origem?: string }

export async function GET(req: Request) {
  const g = await guardarSite(req, 'catalogo')
  if (g.resposta) return g.resposta
  let doSite: MarcaSite[] = []
  try {
    const r = await fetch(`${SITE_URL}/catalogo.json`, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (r.ok) doSite = ((JSON.parse(fotosDoSite(await r.text())) as { marcas?: MarcaSite[] }).marcas) || []
  } catch { /* site fora: só as daqui */ }
  const { data, error } = await sb.from('site_marcas').select('*').order('nome')
  if (error) return NextResponse.json({ ok: false, erro: falta(error.message) ? MSG_SQL : error.message, doSite }, { status: falta(error.message) ? 503 : 500 })
  return NextResponse.json({ ok: true, doSite, salvas: data || [], podeEditar: podeEditar(g.user) })
}

export async function PUT(req: Request) {
  const g = await guardarSite(req, 'catalogo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const b = ((await req.json().catch(() => null)) || {}) as Record<string, unknown>
  const t = (x: unknown, n: number) => { const s = String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n); return s || null }
  const nome = t(b.nome, 40)
  if (!nome || nome.length < 2) return NextResponse.json({ ok: false, erro: 'Escreva o nome da marca' }, { status: 400 })
  const url = (x: unknown) => { const s = t(x, 500); return s && /^https:\/\//.test(s) ? s : null }
  const linha = {
    nome, logo: url(b.logo), banner: url(b.banner), sobre: t(b.sobre, 600),
    sob_consulta: (Array.isArray(b.sob_consulta) ? b.sob_consulta : []).map((x) => t(x, 60)).filter(Boolean).slice(0, 30),
    ordem: b.ordem === null || b.ordem === '' || b.ordem === undefined ? null : Math.round(Number(b.ordem)) || null,
    atualizado_em: new Date().toISOString(), atualizado_por: g.user.nome || g.user.email || 'Portal',
  }
  // renomear: apaga a linha do nome antigo
  const antigo = t(b.nome_antigo, 40)
  if (antigo && antigo !== nome) await sb.from('site_marcas').delete().eq('nome', antigo)
  const { data, error } = await sb.from('site_marcas').upsert(linha).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: falta(error.message) ? MSG_SQL : error.message }, { status: 500 })
  return NextResponse.json({ ok: true, marca: data })
}

export async function DELETE(req: Request) {
  const g = await guardarSite(req, 'catalogo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão' }, { status: 403 })
  const nome = new URL(req.url).searchParams.get('nome') || ''
  const { error } = await sb.from('site_marcas').delete().eq('nome', nome)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  await sb.from('site_catalogo_hist').insert({ slug: `marca:${nome}`.slice(0, 120), campo: 'apagou', de: nome, para: null, por: g.user.nome || g.user.email || 'Portal' })
  return NextResponse.json({ ok: true })
}
