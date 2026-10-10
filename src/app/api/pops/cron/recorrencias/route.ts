// POPs — cron: gera as execuções recorrentes do dia (diário inclui fim de semana e feriado).
// GitHub Actions (.github/workflows/pops-recorrencias.yml) → POST com x-cron-secret.
// Idempotente por (agendamento, data). ?data=YYYY-MM-DD gera outro dia (reprocessar).
import { NextRequest, NextResponse } from 'next/server'
import { comCronRun } from '@/lib/cron/observar'
import { gerarExecucoesDoDia } from '@/lib/pops/cron'
import { hojeSP } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function autorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || ''
  return !!secret && (auth === `Bearer ${secret}` || alt === secret)
}

async function executar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pedida = req.nextUrl.searchParams.get('data') || ''
  const data = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hojeSP()
  try {
    const r = await comCronRun('pops-recorrencias', () => gerarExecucoesDoDia(data), { lockMinutos: 10 })
    if ('pulado' in r && r.pulado) return NextResponse.json({ sucesso: true, pulado: true })
    return NextResponse.json({ sucesso: true, ...('resultado' in r ? { resultado: r.resultado } : {}) })
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 })
  }
}
export async function GET(req: NextRequest) { return executar(req) }
export async function POST(req: NextRequest) { return executar(req) }
