// =============================================================================
// API: sync/cmc-historico/status - port FIEL de GET
// /api/sync/cmc-historico/status do server.js (linhas 4467-4473). Retorna o
// estado do enriquecimento do CMC historico da conta informada; com
// conta=todas (ou sem conta) retorna o estado de todas as contas por id.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getCMCHistoricoState } from '@/lib/dre-financeiro/calc'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const conta = (request.nextUrl.searchParams.get('conta') || '').toString().toLowerCase()
  if (conta && conta !== 'todas') return NextResponse.json(getCMCHistoricoState(conta))
  const tudo: Record<string, any> = {}
  getContasOmie().forEach((c: any) => { tudo[c.id] = getCMCHistoricoState(c.id) })
  return NextResponse.json(tudo)
}
