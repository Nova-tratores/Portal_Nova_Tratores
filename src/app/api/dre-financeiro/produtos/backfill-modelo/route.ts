// =============================================================================
// API: produtos/backfill-modelo - port FIEL de POST /api/produtos/backfill-modelo
// do server.js (linhas 3513-3525). Dispara em background o backfill do campo
// "modelo" dos produtos da conta (nova|castro). refazer=1|true sobrescreve os
// modelos ja preenchidos (repopular); default so preenche os vazios. Responde
// 202 sem esperar o termino (pode demorar ~2min). 'todas' nao e aceito.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
import { backfillModeloProdutos } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const conta = (sp.get('conta') || CONTA_PADRAO).toString().toLowerCase()
    if (conta === 'todas') return NextResponse.json({ erro: 'Especifique conta=nova ou conta=castro' }, { status: 400 })
    // refazer=1 -> sobrescreve modelos existentes (repopular). Default: so preenche vazios.
    const refazer = sp.get('refazer') === '1' || sp.get('refazer') === 'true'
    // Dispara em background (pode demorar ~2min)
    backfillModeloProdutos(conta, { soVazios: !refazer }).catch((e: any) => console.error('backfill-modelo bg:', e))
    return NextResponse.json({ ok: true, mensagem: 'Backfill iniciado em background' + (refazer ? ' (modo repopular)' : ''), conta, refazer }, { status: 202 })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
