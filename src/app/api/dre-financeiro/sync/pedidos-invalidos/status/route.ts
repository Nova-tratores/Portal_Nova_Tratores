// =============================================================================
// API: sync/pedidos-invalidos/status - port FIEL de GET
// /api/sync/pedidos-invalidos/status do server.js (linhas 4721-4727). Retorna
// o estado da deteccao de pedidos invalidos da conta informada; com
// conta=todas (ou sem conta) retorna o estado de todas as contas por id.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getPedidosInvalidosState } from '@/lib/dre-financeiro/calc'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const conta = (request.nextUrl.searchParams.get('conta') || '').toString().toLowerCase()
  if (conta && conta !== 'todas') return NextResponse.json(getPedidosInvalidosState(conta))
  const tudo: Record<string, any> = {}
  getContasOmie().forEach((c: any) => { tudo[c.id] = getPedidosInvalidosState(c.id) })
  return NextResponse.json(tudo)
}
