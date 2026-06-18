// =============================================================================
// API: sync/conta - port FIEL de POST /api/sync/conta do server.js
// (linhas 4099-4117). Sempre dispara pagar + receber para a conta solicitada.
// 'todas' NAO e aceito (use /api/sync/all). Responde 202 sem esperar o termino.
// Janela por vencimento: por padrao, mes-3 a mes+6 (do contexto da pagina).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
import { sincronizarTudo, fmtBR } from '@/lib/dre-financeiro/omie-api'
import { inicioMes, fimMes } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const conta = (sp.get('conta') || CONTA_PADRAO).toString().toLowerCase()
  if (conta === 'todas') {
    return NextResponse.json({ erro: 'sync requer conta especifica (use /api/sync/all)' }, { status: 400 })
  }
  // Janela por vencimento: por padrao, mes-3 a mes+6 (do contexto da pagina)
  const now = new Date()
  let de = sp.get('de')
  let ate = sp.get('ate')
  if (!de || !ate) {
    const mesRef = parseInt(sp.get('mes') || '', 10) || (now.getMonth() + 1)
    const anoRef = parseInt(sp.get('ano') || '', 10) || now.getFullYear()
    de = fmtBR(inicioMes(anoRef, mesRef - 3))
    ate = fmtBR(fimMes(anoRef, mesRef + 6))
  }
  // Dispara em background (pagar + receber em sequencia)
  sincronizarTudo(conta, de, ate).catch((e: any) => console.error('sync bg:', e))
  return NextResponse.json({ ok: true, mensagem: 'sync iniciado (pagar + receber)', conta, de, ate }, { status: 202 })
}
