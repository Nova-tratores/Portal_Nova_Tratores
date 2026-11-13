// GET /api/empresa/vendedores[?recalcular=1] — dados do app vendedor de cada vendedor (carro, km, visitas, negócios),
// últimos 30 dias, para a tela do diretor (/empresa → Comercial → Vendedores). Lê o que o robô `empresa-snapshot`
// gravou em empresa_painel (src/lib/empresa/painel-gravado.ts; conta em src/lib/empresa/vendedores.ts).
// Permissão: a mesma das outras rotas do /empresa (guardarDre).
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { lerArea } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  try {
    const r = await lerArea('vendedores', req.nextUrl.searchParams.get('recalcular') === '1')
    return NextResponse.json({ ...(r.dados as object), calculadoEm: r.calculadoEm }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
