// =============================================================================
// API: DRE consolidada (regime de caixa, baseada no DRE da Omie via cache).
// Port FIEL de GET /api/dre do server.js (linhas 3005-3024).
// Valida o periodo (desde/ate em YYYY-MM, max 60 meses) e delega o calculo a
// calcularDREConsolidada. tipo_data=2 usa data de pagamento; default 1 (emissao).
// refresh=1|true forca recalculo (ignora cache supabase).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { calcularDREConsolidada } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const desdeQ = String(sp.get('desde') || '')
    const ateQ = String(sp.get('ate') || '')
    const desde = desdeQ.match(/^\d{4}-\d{2}$/) ? desdeQ : null
    const ate = ateQ.match(/^\d{4}-\d{2}$/) ? ateQ : null
    const cTipoData = sp.get('tipo_data') === '2' ? '2' : '1'
    const forceRefresh = sp.get('refresh') === '1' || sp.get('refresh') === 'true'
    if (!desde || !ate) return NextResponse.json({ erro: 'Informe desde=YYYY-MM e ate=YYYY-MM' }, { status: 400 })
    // Limite generoso (60 meses) - cache em supabase mitiga rate limit em re-consultas
    const [ai, mi] = desde.split('-').map(Number)
    const [af, mf] = ate.split('-').map(Number)
    const totalMeses = (af - ai) * 12 + (mf - mi) + 1
    if (totalMeses > 60) return NextResponse.json({ erro: `Periodo muito longo (${totalMeses} meses). Maximo 60 por consulta.` }, { status: 400 })
    if (totalMeses < 1) return NextResponse.json({ erro: 'Periodo invalido (desde > ate)' }, { status: 400 })
    const r = await calcularDREConsolidada(desde, ate, cTipoData, forceRefresh)
    return NextResponse.json(r)
  } catch (e: any) {
    console.error('dre:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
