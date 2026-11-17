// GET /api/empresa/posvendas[?recalcular=1] — Pós-Vendas da tela do diretor: faturamento por tipo (faturadas, garantia,
// internas, ainda não faturadas) e horas de cada técnico por semana e mês. Conta em src/lib/empresa/posvendas.ts, gravada
// em empresa_painel (robô empresa-snapshot). Permissão: a mesma das outras rotas do /empresa (guardarDre).
import { NextRequest, NextResponse } from 'next/server'
import { guardarEmpresa } from '@/lib/dre-financeiro/rota'
import { lerArea, areaIgual } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarEmpresa(req, 'posvendas')
  if (g.resposta) return g.resposta
  try {
    // a tela pergunta "mudou desde X?" a cada minuto: 204 = igual, não baixa de novo (16/11)
    if (req.nextUrl.searchParams.get('recalcular') !== '1' && (await areaIgual('posvendas', req.nextUrl.searchParams.get('desde')))) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    const r = await lerArea('posvendas', req.nextUrl.searchParams.get('recalcular') === '1')
    return NextResponse.json({ ...(r.dados as object), calculadoEm: r.calculadoEm }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
