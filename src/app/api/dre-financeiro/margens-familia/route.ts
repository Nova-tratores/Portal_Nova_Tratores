// =============================================================================
// API: margens-familia - margens (receita/CMV) por familia CRUZADAS por mes,
// no intervalo desde..ate. Base de competencia (vendas_itens). O front reagrega
// por mes/trimestre/ano e rateia as despesas do DRE pela receita de cada familia
// para obter a margem liquida. Delega para calcularMargensPorFamilia do calc.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO, calcularMargensPorFamilia } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// pegaConta reimplementado inline: le searchParams 'conta', senao cookie,
// senao default. Valores: nova|castro|todas.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const sp = request.nextUrl.searchParams
    const desde = sp.get('desde') || ''
    const ate = sp.get('ate') || ''
    const r = await calcularMargensPorFamilia(conta, desde, ate)
    return NextResponse.json({ conta, desde, ate, ...r })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
