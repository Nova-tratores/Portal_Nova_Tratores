// =============================================================================
// API: área Contas do mês do Financeiro novo (06/11/2026): as contas a pagar do Omie (espelho) dos blocos
// F1 Fixas, F2 Impostos, F3 Bens e consórcios e F4 Marketing, pelo vencimento no mês, da empresa escolhida.
// Só lê. Mesma trava das telas do Caixa (módulo financeiro). As recorrentes que faltam vêm de /api/financeiro/recorrentes.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { BLOCOS_CONTAS_MES } from '@/lib/financeiro/modulosContas'
import { lerContasModulo, mesDeHoje, mesValido } from '@/lib/financeiro/modulosContas-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardarDre(request, 'calendario')
  if (g.resposta) return g.resposta
  try {
    const sp = request.nextUrl.searchParams
    const mes = mesValido(sp.get('mes')) || mesDeHoje()
    const conta = sp.get('conta') === 'castro' ? 'castro' : 'nova'
    return NextResponse.json({ mes, conta, contas: await lerContasModulo(BLOCOS_CONTAS_MES, mes, conta) })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
