// =============================================================================
// API: área Banco do Financeiro novo (06/11/2026): as contas a pagar do Omie (espelho) dos blocos B1 Empréstimos,
// B2 Antecipações (mesma categoria dos empréstimos, separadas pelo parceiro) e B4 Tarifas e multas, pelo
// vencimento no mês, da empresa escolhida. Só lê. As contas correntes vêm de /api/dre-financeiro/movimentos e
// as operações de antecipação de /api/dre-financeiro/movimentos/antecipacoes.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { BLOCOS_BANCO } from '@/lib/financeiro/modulosContas'
import { lerContasModulo, mesDeHoje, mesValido } from '@/lib/financeiro/modulosContas-server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardarDre(request, 'calendario')
  if (g.resposta) return g.resposta
  try {
    const sp = request.nextUrl.searchParams
    const mes = mesValido(sp.get('mes')) || mesDeHoje()
    const conta = sp.get('conta') === 'castro' ? 'castro' : 'nova'
    return NextResponse.json({ mes, conta, contas: await lerContasModulo(BLOCOS_BANCO, mes, conta) })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
