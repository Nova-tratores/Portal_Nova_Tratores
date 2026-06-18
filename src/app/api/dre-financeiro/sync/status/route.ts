// =============================================================================
// API: sync/status - port FIEL de GET /api/sync/status do server.js
// (linhas 4144-4152). Retorna o estado de sincronizacao (agregado pagar +
// receber) da conta informada; com conta=todas (ou sem conta) retorna o
// estado de todas as contas mapeado por id.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
import { getContasOmie, getSyncState } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const conta = (request.nextUrl.searchParams.get('conta') || CONTA_PADRAO).toString().toLowerCase()
  if (conta === 'todas' || !conta) {
    const tudo: Record<string, any> = {}
    getContasOmie().forEach((c: any) => { tudo[c.id] = getSyncState(c.id) })
    return NextResponse.json(tudo)
  }
  return NextResponse.json(getSyncState(conta))
}
