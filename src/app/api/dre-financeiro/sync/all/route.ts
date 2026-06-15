// =============================================================================
// API: sync/all - port FIEL de POST /api/sync/all do server.js
// (linhas 4125-4142). Dispara em background pagar + receber para TODAS as
// contas Omie. Pula contas que ja estiverem sincronizando. Responde 202.
// Janela por vencimento: mes-3 a mes+6 (do contexto da pagina).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getContasOmie, getSyncState, sincronizarTudo, fmtBR } from '@/lib/dre-financeiro/omie-api'
import { inicioMes, fimMes } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const contas = getContasOmie()
  const now = new Date()
  const mesRef = parseInt(sp.get('mes') || '', 10) || (now.getMonth() + 1)
  const anoRef = parseInt(sp.get('ano') || '', 10) || now.getFullYear()
  const de = fmtBR(inicioMes(anoRef, mesRef - 3))
  const ate = fmtBR(fimMes(anoRef, mesRef + 6))

  const iniciadas: string[] = []
  const puladas: string[] = []
  contas.forEach((c: any) => {
    const s = getSyncState(c.id)
    if (s.rodando) { puladas.push(c.id); return }
    sincronizarTudo(c.id, de, ate).catch((e: any) => console.error('sync bg:', e))
    iniciadas.push(c.id)
  })
  return NextResponse.json({ ok: true, iniciadas, puladas, de, ate }, { status: 202 })
}
