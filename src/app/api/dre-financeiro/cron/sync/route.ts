// =============================================================================
// API: cron/sync - dispara o sync de TODAS as contas (pagar + receber + baixas)
// sem depender de clique manual. Chamado por GitHub Action agendado, ja que o
// Portal roda no Railway e o vercel.json nao executa cron.
// Autenticacao: Authorization: Bearer ${CRON_SECRET}. Responde 202 (background).
// Mesma logica da rota /api/dre-financeiro/sync/all (mes-3 a mes+6).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getContasOmie, getSyncState, sincronizarTudo, sincronizarMovimentosCC, fmtBR } from '@/lib/dre-financeiro/omie-api'
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
  // Movimentos de conta corrente (movimentos_cc): janela por data de PAGAMENTO,
  // mes-2 ate o fim do mes atual - cobre re-sync de baixas atrasadas e alimenta
  // os lancamentos sem titulo que a DRE Competencia le (juros de antecipacao).
  const deMov = fmtBR(inicioMes(anoRef, mesRef - 2))
  const ateMov = fmtBR(fimMes(anoRef, mesRef))

  const iniciadas: string[] = []
  const puladas: string[] = []
  contas.forEach((c: any) => {
    const s = getSyncState(c.id)
    if (s.rodando) { puladas.push(c.id); return }
    // Movimentos rodam APOS o sync de titulos da mesma conta (sequencial por
    // app key, para nao competir com o rate-limit da Omie).
    sincronizarTudo(c.id, de, ate)
      .then(() => sincronizarMovimentosCC(c.id, deMov, ateMov))
      .catch((e: any) => console.error('cron sync bg:', e))
    iniciadas.push(c.id)
  })
  console.log(`[dre cron sync] iniciadas=${iniciadas.join(',') || '-'} puladas=${puladas.join(',') || '-'} janela=${de}..${ate} movimentos=${deMov}..${ateMov}`)
  return NextResponse.json({ ok: true, iniciadas, puladas, de, ate, movimentos: { de: deMov, ate: ateMov } }, { status: 202 })
}
