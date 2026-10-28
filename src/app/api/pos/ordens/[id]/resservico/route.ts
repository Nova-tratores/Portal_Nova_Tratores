// Resserviço da OS (José, 22/10/2026). GET = situação · POST {motivo, erro, tecnicoVolta?, tecnicoVolta2?, previsao?}
// = registra e cria a OS de resserviço para o app dos técnicos · DELETE = desfaz (só antes do técnico preencher).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { abrirResservico, desfazerResservico, lerResservico, ErroResservico } from '@/lib/pos/resservico-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function erro(e: unknown) {
  if (e instanceof ErroResservico) return NextResponse.json({ erro: e.message, semSQL: e.status === 503 }, { status: e.status })
  return NextResponse.json({ erro: e instanceof Error ? e.message : 'erro' }, { status: 500 })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  try { return NextResponse.json(await lerResservico(id)) } catch (e) { return erro(e) }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  try { return NextResponse.json(await abrirResservico(id, body, autorDe(g.user))) } catch (e) { return erro(e) }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  try { return NextResponse.json(await desfazerResservico(id, autorDe(g.user))) } catch (e) { return erro(e) }
}
