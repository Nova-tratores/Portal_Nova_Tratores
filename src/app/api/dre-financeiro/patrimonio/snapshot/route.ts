// =============================================================================
// API: patrimonio/snapshot - port FIEL de POST /api/patrimonio/snapshot do
// server.js (linhas 2164-2199). Backfill manual / forca o snapshot do dia atual
// para todas as contas (nova/castro/todas), persistindo em cp_patrimonio_snapshot.
// A gravação mora em lib/dre-financeiro/patrimonio-snapshot.ts (o agendador usa a mesma).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { gravarSnapshotPatrimonio } from '@/lib/dre-financeiro/patrimonio-snapshot'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Botão da tela Patrimônio (sem trava de admin lá): mesmo gate da tela.
  const g = await guardarDre(request, 'patrimonio')
  if (g.resposta) return g.resposta
  try {
    const r = await gravarSnapshotPatrimonio()
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
