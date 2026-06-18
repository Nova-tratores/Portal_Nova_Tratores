// =============================================================================
// API: monitor/run - port FIEL de POST /api/monitor/run do server.js
// (linhas 4221-4238). Dispara um robo (ou todos) em background e responde 202
// sem esperar o termino.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'
import { runMonitor, runTodos, MODULOS } from '@/lib/dre-financeiro/monitors'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const modulo = sp.get('modulo') ? String(sp.get('modulo')) : null
  const conta = (sp.get('conta') || 'todas').toString().toLowerCase()

  if (!modulo || modulo === 'todos') {
    runTodos().catch((e: any) => console.error('[monitor] runTodos bg:', e.message))
    return NextResponse.json({ ok: true, mensagem: 'monitor de todos os modulos iniciado' }, { status: 202 })
  }
  if (!MODULOS.includes(modulo)) return NextResponse.json({ erro: `modulo invalido: ${modulo}` }, { status: 400 })

  const contas = conta === 'todas' ? getContasOmie().map((c: any) => c.id) : [conta]
  ;(async () => {
    for (const c of contas) {
      try { await runMonitor(modulo, c) } catch (e: any) { console.error(`[monitor] ${modulo} ${c} bg:`, e.message) }
    }
  })()
  return NextResponse.json({ ok: true, mensagem: `monitor ${modulo} iniciado`, contas }, { status: 202 })
}
