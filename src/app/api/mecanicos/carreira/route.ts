// Carreira (divisões Ferro → Diamante) e comissão dos técnicos — aba Ocorrências do Centro do
// Pós-Vendas (José, 17/10/2026). GET ?forcar=1 refaz o cálculo (cache de 10 min).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { carreiraEComissoes } from '@/lib/mecanicos/carreira-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  try {
    return NextResponse.json(await carreiraEComissoes(req.nextUrl.searchParams.get('forcar') === '1'))
  } catch (e) {
    console.error('[mecanicos/carreira]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao montar a carreira' }, { status: 500 })
  }
}
