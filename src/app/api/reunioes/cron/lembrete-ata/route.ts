// REUNIÕES — cron de hora em hora: lembra a ata não publicada em 24 h (R11); desde 23/11/2026 também avisa
// quem tem reunião na próxima hora e fecha como "não registrada" a que ficou 7 dias sem ninguém registrar.
// GitHub Actions (.github/workflows/reunioes-lembrete-ata.yml) → POST com x-cron-secret. Idempotente.
import { NextRequest, NextResponse } from 'next/server'
import { comCronRun } from '@/lib/cron/observar'
import { cronLembreteAta, cronLembreteInicio, cronFecharSemRegistro } from '@/lib/reunioes/crons'

// cada parte isolada: erro numa não impede as outras
const seguro = async <T,>(f: () => Promise<T>) => { try { return await f() } catch (e) { return { erro: (e as Error).message } } }
const tudo = async () => ({ ata: await seguro(() => cronLembreteAta()), inicio: await seguro(() => cronLembreteInicio()), semRegistro: await seguro(() => cronFecharSemRegistro()) })

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
    // Chamado pelo agendador do portal (ele já registra a rodada e tem a trava): roda direto.
    if (req.headers.get('x-agendador') === '1') return NextResponse.json({ sucesso: true, resultado: await tudo(), timestamp: new Date().toISOString() })
    const r = await comCronRun('reunioes-lembrete-ata', () => tudo(), { lockMinutos: 10 })
    if ('pulado' in r && r.pulado) return NextResponse.json({ sucesso: true, pulado: true })
    return NextResponse.json({ sucesso: true, ...('resultado' in r ? { resultado: r.resultado } : {}), timestamp: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 })
  }
}
export async function GET(req: NextRequest) { return executar(req) }
export async function POST(req: NextRequest) { return executar(req) }
