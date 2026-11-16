// GET /api/empresa/pecas[?recalcular=1] — Peças da tela do diretor: vendas por mês e por canal (balcão, oficina, revisões),
// pedidos dos últimos 13 meses e o estoque de peças parado. Conta em src/lib/empresa/pecas.ts, gravada em empresa_painel.
// Permissão: a mesma das outras rotas do /empresa (guardarDre).
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { lerArea, areaIgual } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  try {
    // a tela pergunta "mudou desde X?" a cada minuto: 204 = igual, não baixa de novo (16/11)
    if (req.nextUrl.searchParams.get('recalcular') !== '1' && (await areaIgual('pecas', req.nextUrl.searchParams.get('desde')))) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    const r = await lerArea('pecas', req.nextUrl.searchParams.get('recalcular') === '1')
    return NextResponse.json({ ...(r.dados as object), calculadoEm: r.calculadoEm }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
