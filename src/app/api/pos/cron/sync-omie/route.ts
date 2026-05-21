import { NextRequest, NextResponse } from 'next/server'
import { syncClientes, syncProjetos } from '@/lib/pos/sync-omie'

const CRON_SECRET = process.env.CRON_SECRET || ''

export const maxDuration = 300 // 5 min

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  const isFromCron = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`

  if (!isFromCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const resultados: Record<string, unknown> = {}
  const erros: string[] = []

  try {
    resultados.clientes = await syncClientes()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    erros.push(`Clientes: ${msg}`)
    console.error('[Cron Sync Omie] Erro clientes:', msg)
  }

  try {
    resultados.projetos = await syncProjetos()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    erros.push(`Projetos: ${msg}`)
    console.error('[Cron Sync Omie] Erro projetos:', msg)
  }

  const timestamp = new Date().toISOString()
  console.log(`[Cron Sync Omie] ${timestamp} - Clientes: ${JSON.stringify(resultados.clientes)}, Projetos: ${JSON.stringify(resultados.projetos)}`)

  return NextResponse.json({
    sucesso: erros.length === 0,
    resultados,
    erros: erros.length > 0 ? erros : undefined,
    timestamp,
  })
}
