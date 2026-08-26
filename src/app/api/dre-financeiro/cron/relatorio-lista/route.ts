import { NextRequest, NextResponse } from 'next/server'
import { cronRelatorioListaSemanal } from '@/lib/dre-financeiro/cron-relatorio-lista'

// pdfkit exige runtime Node.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET || ''

// Fail-closed: sem CRON_SECRET no ambiente, a rota RECUSA tudo (nunca publica).
function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const alt = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret') || ''
  return !!CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || alt === CRON_SECRET)
}

async function executar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const diasRaw = req.nextUrl.searchParams.get('dias')
    const dias = diasRaw ? parseInt(diasRaw, 10) : undefined
    const resultado = await cronRelatorioListaSemanal(dias)
    return NextResponse.json({ sucesso: true, resultado, timestamp: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return executar(req)
}
export async function POST(req: NextRequest) {
  return executar(req)
}
