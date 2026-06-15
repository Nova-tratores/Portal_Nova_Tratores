// =============================================================================
// API: DRE Competencia (regime de competencia, baseado em vendas_itens +
// contas_pagar). Port FIEL de GET /api/dre-competencia do server.js
// (linhas 3027-3043). Valida o periodo (desde/ate em YYYY-MM, max 60 meses) e
// delega o calculo a calcularDRECompetencia.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { calcularDRECompetencia } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const desdeQ = String(sp.get('desde') || '')
    const ateQ = String(sp.get('ate') || '')
    const desde = desdeQ.match(/^\d{4}-\d{2}$/) ? desdeQ : null
    const ate = ateQ.match(/^\d{4}-\d{2}$/) ? ateQ : null
    if (!desde || !ate) return NextResponse.json({ erro: 'Informe desde=YYYY-MM e ate=YYYY-MM' }, { status: 400 })
    const [ai, mi] = desde.split('-').map(Number)
    const [af, mf] = ate.split('-').map(Number)
    const totalMeses = (af - ai) * 12 + (mf - mi) + 1
    if (totalMeses > 60) return NextResponse.json({ erro: `Periodo muito longo (${totalMeses} meses). Maximo 60.` }, { status: 400 })
    if (totalMeses < 1) return NextResponse.json({ erro: 'Periodo invalido (desde > ate)' }, { status: 400 })
    const r = await calcularDRECompetencia(desde, ate)
    return NextResponse.json(r)
  } catch (e: any) {
    console.error('dre-competencia:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
