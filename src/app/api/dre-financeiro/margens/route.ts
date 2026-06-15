// =============================================================================
// API: margens - port FIEL de GET /api/margens do server.js (linhas 3543-3556).
// Margem bruta operacional por familia/mes (recalc com custo de capital mensal).
// req.query.taxa/meses/desde => searchParams; clamp meses 1..60, default 12;
// taxa default 1.0. A propria calcularMargens acessa supabase internamente.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO, calcularMargens } from '@/lib/dre-financeiro/calc'

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
    const taxa = parseFloat(sp.get('taxa') as string) || 1.0
    const meses = Math.max(1, Math.min(60, parseInt(sp.get('meses') as string, 10) || 12))
    const desde = sp.get('desde') || ''
    const r = await calcularMargens(conta, taxa, meses, desde)
    return NextResponse.json({ conta, taxa_mensal_pct: taxa, meses, desde, ...r })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
