// =============================================================================
// API: contratos de empréstimo da empresa escolhida (Financeiro novo › Banco › Empréstimos, 09/11/2026).
// Lê todas as parcelas "Pagamento de Empréstimos" do Omie (espelho contas_pagar), tira as antecipações (B2,
// separadas pelo parceiro) e junta em contratos pela numeração x/total (src/lib/financeiro/contratos.ts).
// Só lê. Mesma trava das telas do Caixa.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { aplicarConta } from '@/lib/dre-financeiro/calc'
import { hoje, statusDerivado } from '@/lib/dre-financeiro/dates'
import { paginar } from '@/lib/db/paginar'
import { BLOCOS_BANCO } from '@/lib/financeiro/modulosContas'
import { montarContratos } from '@/lib/financeiro/contratos'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardarDre(request, 'calendario')
  if (g.resposta) return g.resposta
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const sb = supabase
  try {
    const conta = request.nextUrl.searchParams.get('conta') === 'castro' ? 'castro' : 'nova'
    const { data, error } = await paginar<Record<string, unknown>>((de, ate) => aplicarConta(
      sb.from('contas_pagar')
        .select('codigo_lancamento, conta_omie, nome_fornecedor, numero_parcela, data_vencimento, data_pagamento, valor_documento, valor_pago')
        .eq('descricao_categoria', 'Pagamento de Empréstimos')
        .neq('status_titulo', 'CANCELADO')
        .order('codigo_lancamento', { ascending: true })
        .range(de, ate),
      conta,
    ))
    if (error) throw new Error(error.message)
    const antecipacao = new RegExp(BLOCOS_BANCO.find((b) => b.codigo === 'B2')?.fornecedores || '$^', 'i')
    const ref = hoje()
    const hojeISO = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
    const parcelas = data
      .filter((r) => r.data_vencimento && !antecipacao.test(String(r.nome_fornecedor || '')))
      .map((r) => ({
        conta_omie: String(r.conta_omie),
        nome_fornecedor: (r.nome_fornecedor as string) || null,
        numero_parcela: (r.numero_parcela as string) || null,
        data_vencimento: String(r.data_vencimento).slice(0, 10),
        valor_documento: Number(r.valor_documento) || 0,
        valor_pago: Number(r.valor_pago) || 0,
        paga: statusDerivado(r, ref) === 'LIQUIDADO',
      }))
    return NextResponse.json({ conta, contratos: montarContratos(parcelas, hojeISO) })
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
