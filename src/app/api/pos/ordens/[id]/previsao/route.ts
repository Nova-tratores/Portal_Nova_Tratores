// Previsão de horas da OS pelo tempário Mahindra + avisos (José, 20/10/2026). GET = guardada ou calcula;
// GET ?refazer=1 = recalcula.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { preverOS } from '@/lib/mecanicos/previsao-os-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  try {
    const p = await preverOS(decodeURIComponent(id), { forcar: req.nextUrl.searchParams.get('refazer') === '1' })
    return NextResponse.json({ previsao: p })
  } catch (e) { return NextResponse.json({ previsao: null, erro: e instanceof Error ? e.message : 'Falha' }) }
}
