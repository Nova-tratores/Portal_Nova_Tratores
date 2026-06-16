// =============================================================================
// API: sync/pedidos-invalidos - port FIEL de POST /api/sync/pedidos-invalidos
// do server.js (linhas 4704-4719). Dispara em background a deteccao de pedidos
// de venda invalidos (cancelados/devolvidos) pra 1 conta (ou todas com
// ?conta=todas). Em modo "todas" roda SEQUENCIAL. Responde 202.
// Params opcionais:
//   limite: teto de consultas Omie por execucao (default 30)
//   heuristica: 1 pra aplicar marcacao heuristica (default off)
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getPedidosInvalidosState, detectarPedidosInvalidos } from '@/lib/dre-financeiro/calc'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const conta = (sp.get('conta') || '').toString().toLowerCase()
  if (!conta) return NextResponse.json({ erro: 'informe ?conta=nova|castro|todas' }, { status: 400 })
  const limite = parseInt(sp.get('limite') || '', 10) || 30
  const heuristica = sp.get('heuristica') === '1'
  const alvos = conta === 'todas' ? getContasOmie().map((c: any) => c.id) : [conta]
  const puladas = alvos.filter((c: string) => getPedidosInvalidosState(c).rodando)
  const iniciadas = alvos.filter((c: string) => !getPedidosInvalidosState(c).rodando)
  ;(async () => {
    for (const c of iniciadas) {
      try { await detectarPedidosInvalidos(c, { limite, heuristica }) }
      catch (e) { console.error('ped-invalid bg:', e) }
    }
  })()
  return NextResponse.json({ ok: true, iniciadas, puladas, limite, heuristica }, { status: 202 })
}
