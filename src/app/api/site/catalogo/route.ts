// Catálogo do site (portal, módulo Site → Catálogo).
// GET: a lista vem do PRÓPRIO site (SITE_URL/catalogo.json, gerado no build) + o que foi mudado aqui (site_catalogo).
// PATCH: grava preço, mostrar preço, pronta entrega, selo, ocultar e notas, com histórico (site:catalogo:editar).
import { NextResponse } from 'next/server'
import { AVISO_MIGRATION, SITE_URL, guardarSite, sb, semMigration } from '@/lib/site/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ItemSite = {
  slug: string; titulo: string; categoria: string; marca: string; modelo: string; potencia_cv: number | null
  foto: string | null; link: string; padrao: { preco: number | null; exibir_preco: boolean; pronta_entrega: boolean }
}
type Linha = Record<string, unknown>
const CAMPOS = ['preco', 'exibir_preco', 'pronta_entrega', 'oculto', 'selo', 'notas'] as const

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) =>
  u.isAdmin || u.modulos.includes('site') || u.modulos.includes('site:catalogo:editar')

export async function GET(req: Request) {
  const g = await guardarSite(req, 'catalogo')
  if (g.resposta) return g.resposta
  let itens: ItemSite[] = []
  let erroSite = ''
  try {
    const r = await fetch(`${SITE_URL}/catalogo.json`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`)
    itens = ((await r.json()) as { itens: ItemSite[] }).itens
  } catch (e) {
    erroSite = `Não consegui ler ${SITE_URL}/catalogo.json (${e instanceof Error ? e.message : 'erro'}).`
  }
  const { data, error } = await sb.from('site_catalogo').select('*')
  if (error && semMigration(error.message)) return NextResponse.json({ ok: false, erro: AVISO_MIGRATION }, { status: 503 })
  const mudancas = new Map(((data || []) as Linha[]).map((m) => [String(m.slug), m]))
  return NextResponse.json({
    ok: true, erroSite, site: SITE_URL, podeEditar: podeEditar(g.user),
    itens: itens.map((i) => ({ ...i, mudanca: mudancas.get(i.slug) || null })),
  })
}

export async function PATCH(req: Request) {
  const g = await guardarSite(req, 'catalogo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão para mudar o catálogo' }, { status: 403 })
  const b = (await req.json().catch(() => null)) as ({ slug?: string } & Linha) | null
  const slug = String(b?.slug || '')
  if (!b || !/^[a-z0-9-]{2,120}$/.test(slug)) return NextResponse.json({ ok: false, erro: 'produto inválido' }, { status: 400 })

  const { data: antes } = await sb.from('site_catalogo').select('*').eq('slug', slug).maybeSingle()
  const por = g.user.nome || g.user.email || 'Portal'
  const novo: Linha = { slug, atualizado_em: new Date().toISOString(), atualizado_por: por }
  for (const c of CAMPOS) {
    if (!(c in b)) continue
    const v = b[c]
    if (c === 'preco') novo.preco = v === null || v === '' ? null : Math.max(0, Math.round(Number(v) * 100) / 100)
    else if (c === 'selo') novo.selo = v ? String(v).trim().slice(0, 30) : null
    else if (c === 'notas') novo.notas = v ? String(v).slice(0, 1000) : null
    else novo[c] = v === true
  }
  const { data, error } = await sb.from('site_catalogo').upsert(novo).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: semMigration(error.message) ? AVISO_MIGRATION : error.message }, { status: 500 })
  const velho = (antes || {}) as Linha
  const depois = data as Linha
  const txt = (v: unknown) => (v == null ? null : String(v))
  const hist = CAMPOS.filter((c) => c in b && txt(velho[c]) !== txt(depois[c]))
    .map((c) => ({ slug, campo: c, de: txt(velho[c]), para: txt(depois[c]), por }))
  if (hist.length) await sb.from('site_catalogo_hist').insert(hist)
  return NextResponse.json({ ok: true, mudanca: data })
}
