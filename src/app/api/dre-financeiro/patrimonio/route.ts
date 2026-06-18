// =============================================================================
// API: patrimonio (visao consolidada) - port FIEL de GET /api/patrimonio do
// server.js (linhas 1741-1755). Calcula patrimonio operacional + ciclo de caixa
// + cobertura para a conta selecionada. Ciclo e cobertura falham em silencio
// (retornam null) sem derrubar a resposta.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO, calcularPatrimonio, calcularCicloDeCaixa, calcularCobertura } from '@/lib/dre-financeiro/calc'

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
    const [p, ciclo, cobertura] = await Promise.all([
      calcularPatrimonio(conta),
      calcularCicloDeCaixa(conta).catch((e: any) => { console.error('ciclo:', e.message); return null }),
      calcularCobertura(conta).catch((e: any) => { console.error('cobertura:', e.message); return null }),
    ])
    return NextResponse.json({ conta, ...p, ciclo_caixa: ciclo, cobertura })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
