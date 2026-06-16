// =============================================================================
// API: vendas-modelo - port FIEL de GET /api/vendas-modelo do server.js
// (linhas 2409-2423). Agrega vendas por modelo (familia/modelo) para a conta
// selecionada, na janela de N meses (ou desde uma data). Delega o calculo para
// calcularVendasPorModelo do calc.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO, calcularVendasPorModelo } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// pegaConta reimplementado inline (server.js:68-72): le searchParams 'conta',
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
    const meses = Math.max(1, Math.min(60, parseInt(sp.get('meses') || '', 10) || 12))
    const desde = sp.get('desde') || ''
    const familia = sp.get('familia') || ''
    const modelo = sp.get('modelo') || ''
    const r = await calcularVendasPorModelo(conta, meses, desde, familia, modelo)
    // server.js:2418 fazia { conta, meses, desde, familia, modelo, ...r }: a chave
    // numerica 'meses' (janela) era sobrescrita por r.meses (array de meses).
    // Removemos a 'meses' numerica explicita pra evitar TS2783 mantendo o payload
    // identico (o 'meses' final continua sendo r.meses, o array).
    return NextResponse.json({ conta, desde, familia, modelo, ...r })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
