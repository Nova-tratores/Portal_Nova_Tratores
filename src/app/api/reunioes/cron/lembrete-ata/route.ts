// REUNIÕES — cron: lembra secretário/condutor da ata não publicada em 24 h (R11)
// GitHub Actions (.github/workflows/reunioes-lembrete-ata.yml) → POST com x-cron-secret. Idempotente.
import { NextRequest, NextResponse } from 'next/server'
import { comCronRun } from '@/lib/cron/observar'
import { cronLembreteAta } from '@/lib/reunioes/crons'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET || ''
function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || ''
  return !!CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || alt === CRON_SECRET)
}

async function executar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const r = await comCronRun('reunioes-lembrete-ata', () => cronLembreteAta(), { lockMinutos: 10 })
    if ('pulado' in r && r.pulado) return NextResponse.json({ sucesso: true, pulado: true })
    return NextResponse.json({ sucesso: true, ...('resultado' in r ? { resultado: r.resultado } : {}), timestamp: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 })
  }
}
export async function GET(req: NextRequest) { return executar(req) }
export async function POST(req: NextRequest) { return executar(req) }
