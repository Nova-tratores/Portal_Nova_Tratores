// =============================================================================
// API: sync/cmc-historico - port FIEL de POST /api/sync/cmc-historico do
// server.js (linhas 4450-4465). Dispara o enriquecimento do CMC historico em
// background pra 1 conta (ou todas com ?conta=todas). Em modo "todas" roda
// SEQUENCIAL pra evitar dobrar pressao na quota Omie. Responde 202.
// Params opcionais:
//   limite: teto de chamadas Omie por execucao (default 100)
//   incluirPecas: 1 pra incluir pecas (default: so maquinas - pecas rate-limit muito)
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getCMCHistoricoState, enriquecerCMCHistorico } from '@/lib/dre-financeiro/calc'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const conta = (sp.get('conta') || '').toString().toLowerCase()
  if (!conta) return NextResponse.json({ erro: 'informe ?conta=nova|castro|todas' }, { status: 400 })
  const limite = parseInt(sp.get('limite') || '', 10) || 100
  const incluirPecas = sp.get('incluirPecas') === '1'
  const alvos = conta === 'todas' ? getContasOmie().map((c: any) => c.id) : [conta]
  const puladas = alvos.filter((c: string) => getCMCHistoricoState(c).rodando)
  const iniciadas = alvos.filter((c: string) => !getCMCHistoricoState(c).rodando)
  ;(async () => {
    for (const c of iniciadas) {
      try { await enriquecerCMCHistorico(c, { limite, incluirPecas }) }
      catch (e) { console.error('cmc-hist bg:', e) }
    }
  })()
  return NextResponse.json({ ok: true, iniciadas, puladas, limite, incluirPecas }, { status: 202 })
}
