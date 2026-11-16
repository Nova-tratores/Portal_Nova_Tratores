// Conteúdo do site (portal, módulo Site → Conteúdo).
// GET: texto padrão (lido do próprio site) + o que foi mudado aqui + se há mudança ainda não publicada.
// PUT: grava uma seção (site:conteudo:editar), com histórico.
import { NextResponse } from 'next/server'
import { AVISO_MIGRATION, SITE_URL, guardarSite, sb, semMigration } from '@/lib/site/server'
import { GRUPOS, validarGrupo, type GrupoConteudo } from '@/lib/site/conteudo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const podeEditar = (u: { isAdmin: boolean; modulos: string[] }) => u.isAdmin || u.modulos.includes('site') || u.modulos.includes('site:conteudo:editar')

export async function GET(req: Request) {
  const g = await guardarSite(req, 'conteudo')
  if (g.resposta) return g.resposta
  let padrao: Record<string, Record<string, unknown>> = {}
  let erroSite = ''
  try {
    const r = await fetch(`${SITE_URL}/conteudo-padrao.json`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`)
    padrao = ((await r.json()) as { padrao: typeof padrao }).padrao || {}
  } catch (e) {
    erroSite = `Não consegui ler o texto padrão em ${SITE_URL}/conteudo-padrao.json (${e instanceof Error ? e.message : 'erro'}).`
  }
  const [{ data, error }, { data: pubs }] = await Promise.all([
    sb.from('site_conteudo').select('*'),
    sb.from('site_publicacoes').select('*').order('pedido_em', { ascending: false }).limit(5),
  ])
  if (error) {
    const falta = semMigration(error.message)
    return NextResponse.json({ ok: false, erro: falta ? 'Rode sql/site-conteudo.sql no projeto do portal.' : error.message }, { status: falta ? 503 : 500 })
  }
  const salvo: Record<string, { valor: Record<string, unknown>; atualizado_em: string; atualizado_por: string | null }> = {}
  for (const l of (data || []) as { grupo: string; valor: Record<string, unknown>; atualizado_em: string; atualizado_por: string | null }[]) salvo[l.grupo] = l
  const ultimaOk = ((pubs || []) as { ok: boolean; pedido_em: string }[]).find((p) => p.ok)?.pedido_em || null
  const pendente = Object.values(salvo).some((s) => !ultimaOk || s.atualizado_em > ultimaOk)
  return NextResponse.json({
    ok: true, erroSite, site: SITE_URL, padrao, salvo, publicacoes: pubs || [], pendente,
    podeEditar: podeEditar(g.user), podePublicar: g.user.isAdmin || g.user.modulos.includes('site') || g.user.modulos.includes('site:conteudo:publicar'),
    hookConfigurado: !!process.env.SITE_DEPLOY_HOOK,
  })
}

export async function PUT(req: Request) {
  const g = await guardarSite(req, 'conteudo', true)
  if (g.resposta) return g.resposta
  if (!podeEditar(g.user)) return NextResponse.json({ ok: false, erro: 'sem permissão para editar o conteúdo' }, { status: 403 })
  const b = (await req.json().catch(() => null)) as { grupo?: string; valor?: Record<string, unknown> } | null
  if (!b?.grupo || !GRUPOS.includes(b.grupo as GrupoConteudo) || !b.valor || typeof b.valor !== 'object') {
    return NextResponse.json({ ok: false, erro: 'seção inválida' }, { status: 400 })
  }
  const v = validarGrupo(b.grupo as GrupoConteudo, b.valor)
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400 })
  const por = g.user.nome || g.user.email || 'Portal'
  const { data: antes } = await sb.from('site_conteudo').select('valor').eq('grupo', b.grupo).maybeSingle()
  const { data, error } = await sb.from('site_conteudo')
    .upsert({ grupo: b.grupo, valor: v.valor, atualizado_em: new Date().toISOString(), atualizado_por: por }).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: semMigration(error.message) ? AVISO_MIGRATION : error.message }, { status: 500 })
  await sb.from('site_conteudo_hist').insert({ grupo: b.grupo, antes: (antes as { valor?: unknown } | null)?.valor ?? null, depois: v.valor, por })
  return NextResponse.json({ ok: true, salvo: data })
}
