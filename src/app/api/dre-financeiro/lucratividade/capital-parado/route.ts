// =============================================================================
// API: capital parado em estoque - port FIEL de GET /api/lucratividade/capital-parado
// do server.js (linhas 3703-3716). Produtos sem giro: dias desde a ultima venda
// x custo de capital (SELIC mensal) = custo de oportunidade.
// req.query.dias/selic/familia => searchParams; clamp dias >=1, default 180;
// selic default 1.0; familia default ''. calcularCapitalParado acessa supabase.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO, calcularCapitalParado } from '@/lib/dre-financeiro/calc'

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
    const sp = request.nextUrl.searchParams
    const dias = Math.max(1, parseInt(sp.get('dias') as string, 10) || 180)
    const selic = parseFloat(sp.get('selic') as string) || 1.0
    const familia = sp.get('familia') || ''
    const r = await calcularCapitalParado(conta, dias, selic, familia)
    return NextResponse.json({ conta, ...r })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
