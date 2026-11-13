// GET /api/empresa/posvendas[?recalcular=1] — Pós-Vendas da tela do diretor: faturamento por tipo (faturadas, garantia,
// internas, ainda não faturadas) e horas de cada técnico por semana e mês. Conta em src/lib/empresa/posvendas.ts, gravada
// em empresa_painel (robô empresa-snapshot). Permissão: a mesma das outras rotas do /empresa (guardarDre).
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { lerArea } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  try {
    const r = await lerArea('posvendas', req.nextUrl.searchParams.get('recalcular') === '1')
    return NextResponse.json({ ...(r.dados as object), calculadoEm: r.calculadoEm }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
