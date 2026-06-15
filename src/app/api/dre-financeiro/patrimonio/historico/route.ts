// =============================================================================
// API: patrimonio/historico - port FIEL de GET /api/patrimonio/historico do
// server.js (linhas 1757-1777). Le os snapshots persistidos em
// cp_patrimonio_snapshot dos ultimos N dias (7..730, default 90) para a conta.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
import { hoje, fmtISO, addDias } from '@/lib/dre-financeiro/dates'
import { labelConta } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

// pegaConta reimplementado inline (server.js:68-77): le searchParams 'conta',
// senao cookie, senao default. Valores: nova|castro|todas.
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
    const dias = Math.max(7, Math.min(730, parseInt(request.nextUrl.searchParams.get('dias') || '', 10) || 90))
    const ref = hoje()
    const dataDe = fmtISO(addDias(ref, -dias))
    const contaLabel = conta === 'todas' ? 'TODAS' : labelConta(conta)

    const { data, error } = await supabase.from('cp_patrimonio_snapshot')
      .select('*')
      .eq('conta_omie', contaLabel)
      .gte('data', dataDe)
      .order('data', { ascending: true })
    if (error) throw new Error(error.message)
    return NextResponse.json({ conta, dias, pontos: data || [] })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
