// Pedidos de proposta do site (portal, módulo Site → Pedidos).
// GET: lista (?status=, ?dias=). PATCH: muda status, assume o pedido e anota (site:pedidos ou o módulo inteiro).
import { NextResponse } from 'next/server'
import { AVISO_MIGRATION, guardarSite, sb, semMigration } from '@/lib/site/server'

export const runtime = 'nodejs'
const STATUS = ['novo', 'em_contato', 'proposta', 'ganho', 'perdido', 'descartado']

export async function GET(req: Request) {
  const g = await guardarSite(req, 'pedidos')
  if (g.resposta) return g.resposta
  const u = new URL(req.url)
  const dias = Math.min(Number(u.searchParams.get('dias')) || 90, 730)
  let q = sb.from('site_pedidos').select('*').gte('criado_em', new Date(Date.now() - dias * 86_400_000).toISOString())
    .order('criado_em', { ascending: false }).limit(500)
  const st = u.searchParams.get('status')
  if (st && STATUS.includes(st)) q = q.eq('status', st)
  const { data, error } = await q
  if (error) {
    const falta = semMigration(error.message)
    return NextResponse.json({ ok: false, erro: falta ? AVISO_MIGRATION : error.message }, { status: falta ? 503 : 500 })
  }
  return NextResponse.json({ ok: true, pedidos: data })
}

export async function PATCH(req: Request) {
  const g = await guardarSite(req, 'pedidos', true)
  if (g.resposta) return g.resposta
  const b = (await req.json().catch(() => null)) as { id?: string; status?: string; notas?: string; assumir?: boolean } | null
  if (!b?.id) return NextResponse.json({ ok: false, erro: 'id obrigatório' }, { status: 400 })
  const muda: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (b.status) {
    if (!STATUS.includes(b.status)) return NextResponse.json({ ok: false, erro: 'status inválido' }, { status: 400 })
    muda.status = b.status
    if (b.status !== 'novo') muda.atendido_em = new Date().toISOString()
  }
  if (typeof b.notas === 'string') muda.notas = b.notas.slice(0, 4000)
  if (b.assumir) { muda.responsavel_id = g.user.id; muda.responsavel_nome = g.user.nome || g.user.email || 'Portal' }
  const { data, error } = await sb.from('site_pedidos').update(muda).eq('id', b.id).select('*').single()
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pedido: data })
}
