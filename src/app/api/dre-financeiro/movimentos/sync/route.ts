// =============================================================================
// API: movimentos/sync - dispara a sincronização das Movimentações de Conta
// Corrente (Omie /financas/mf/ ListarMovimentos -> tabela movimentos_cc).
// POST ?conta=nova|castro|todas&de=YYYY-MM-DD&ate=YYYY-MM-DD
//   Janela por DATA DE PAGAMENTO. Default: mês atual. 'todas' roda as contas
//   configuradas em sequência. Responde 202 sem esperar o término.
// GET  -> estado do sync por conta (para polling da tela).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
// @ts-ignore - modulo CommonJS sem tipos
import { sincronizarMovimentosCC, getMovSyncState, getContasOmie } from '@/lib/dre-financeiro/omie-api'
import { fmtISO, inicioMes, fimMes } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ISO (YYYY-MM-DD) -> BR (DD/MM/YYYY), formato que a Omie espera.
function isoParaBR(s: string): string {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

function contasAlvo(conta: string): string[] {
  const configuradas = (getContasOmie() as Array<{ id: string }>).map((c) => c.id)
  if (conta === 'todas') return configuradas
  return configuradas.includes(conta) ? [conta] : []
}

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const conta = (sp.get('conta') || request.cookies.get('conta')?.value || CONTA_PADRAO)
    .toString().toLowerCase()
  const alvo = contasAlvo(conta)
  if (alvo.length === 0) {
    return NextResponse.json({ erro: `conta invalida ou sem credenciais: ${conta}` }, { status: 400 })
  }

  const now = new Date()
  const deISO = sp.get('de') || fmtISO(inicioMes(now.getFullYear(), now.getMonth() + 1))
  const ateISO = sp.get('ate') || fmtISO(fimMes(now.getFullYear(), now.getMonth() + 1))
  const deBR = isoParaBR(deISO)
  const ateBR = isoParaBR(ateISO)

  const ocupada = alvo.find((c) => getMovSyncState(c).rodando)
  if (ocupada) {
    return NextResponse.json({ erro: `sync de movimentos ja em andamento (${ocupada})` }, { status: 409 })
  }

  // Dispara em background, contas em sequência (evita rate-limit da Omie).
  ;(async () => {
    for (const c of alvo) {
      await sincronizarMovimentosCC(c, deBR, ateBR)
    }
  })().catch((e: any) => console.error('sync movimentos bg:', e))

  return NextResponse.json(
    { ok: true, mensagem: 'sync de movimentos iniciado', contas: alvo, de: deISO, ate: ateISO },
    { status: 202 }
  )
}

export async function GET() {
  const contas: Record<string, any> = {}
  let rodando = false
  for (const c of getContasOmie() as Array<{ id: string; label: string }>) {
    const s = getMovSyncState(c.id)
    contas[c.id] = { label: c.label, ...s }
    if (s.rodando) rodando = true
  }
  return NextResponse.json({ rodando, contas })
}
