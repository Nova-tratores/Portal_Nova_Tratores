// =============================================================================
// API: cron/sync - dispara o sync de TODAS as contas (pagar + receber + baixas)
// sem depender de clique manual. Chamado por GitHub Action agendado, ja que o
// Portal roda no Railway e o vercel.json nao executa cron.
// Autenticacao: Authorization: Bearer ${CRON_SECRET}. Responde 202 (background).
// Mesma logica da rota /api/dre-financeiro/sync/all (mes-3 a mes+6).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getContasOmie, getSyncState, sincronizarTudo, fmtBR } from '@/lib/dre-financeiro/omie-api'
import { inicioMes, fimMes } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    sincronizarTudo(c.id, de, ate).catch((e: any) => console.error('cron sync bg:', e))
    iniciadas.push(c.id)
  })
  console.log(`[dre cron sync] iniciadas=${iniciadas.join(',') || '-'} puladas=${puladas.join(',') || '-'} janela=${de}..${ate}`)
  return NextResponse.json({ ok: true, iniciadas, puladas, de, ate }, { status: 202 })
}
