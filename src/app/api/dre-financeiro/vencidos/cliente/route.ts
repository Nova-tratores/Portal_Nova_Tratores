import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { VENCIDOS_IGNORADOS, tabelaPorTipo } from '@/lib/dre-financeiro/calc'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

// Caixa › Vencidos, ao abrir um cliente (José, 05/11/2026): TODAS as contas em aberto dele, nas duas empresas —
// as vencidas (inclusive antes de 01/01, que a lista geral esconde) e as que ainda vão vencer — com a conta
// corrente de cada uma no Omie, para dar baixa dali. `codigos` = os códigos do cliente na Nova e na Castro.
const ABERTOS = ['ATRASADO', 'A VENCER', 'VENCE HOJE']

interface Linha {
  codigo_lancamento: number; conta_omie: string; numero_documento: string | null; numero_documento_fiscal: string | null
  numero_parcela: string | null; descricao_categoria: string | null; data_vencimento: string; valor_documento: number | null
  valor_pago: number | null; status_titulo: string; id_conta_corrente: number | null
}

export async function GET(request: NextRequest) {
  const g = await guardarDre(request, 'vencidos')
  if (g.resposta) return g.resposta
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const sp = request.nextUrl.searchParams
  const tipo = sp.get('tipo') === 'pagar' ? 'pagar' : 'receber'
  const codigos = new Set((sp.get('codigos') || '').split(',').map((c) => Number(c)).filter((n) => Number.isFinite(n) && n > 0).slice(0, 20))
  const documento = (sp.get('documento') || '').replace(/\D/g, '')
  if (!codigos.size && !documento) return NextResponse.json({ erro: 'informe codigos ou documento' }, { status: 400 })
  try {
    // pelo CPF/CNPJ acha também o código do cliente na outra empresa (só vencido numa delas, a vencer na outra)
    if (documento.length >= 11) {
      const { data: cli } = await supabase.from('clientes').select('codigo_cliente_omie').eq('cnpj_norm', documento).limit(20)
      for (const c of cli || []) codigos.add(Number(c.codigo_cliente_omie))
    }
    if (!codigos.size) return NextResponse.json({ titulos: [] })
    const { data, error } = await supabase.from(tabelaPorTipo(tipo))
      .select('codigo_lancamento,conta_omie,numero_documento,numero_documento_fiscal,numero_parcela,descricao_categoria,data_vencimento,valor_documento,valor_pago,status_titulo,id_conta_corrente:raw->id_conta_corrente')
      .in('codigo_cliente_fornecedor', [...codigos])
      .in('status_titulo', ABERTOS)
      .order('data_vencimento', { ascending: true })
      .limit(1000)
    if (error) throw new Error(error.message)
    // dias de atraso pelo relógio de Brasília (mesma conta da lista de vencidos)
    const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
    const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`) / 864e5
    const titulos = ((data || []) as Linha[])
      .filter((r) => r.data_vencimento && !VENCIDOS_IGNORADOS.has(Number(r.codigo_lancamento)))
      .map((r) => {
        const doc = Number(r.valor_documento) || 0
        const pago = Number(r.valor_pago) || 0
        let aberto = doc - pago
        if (aberto <= 0.01) aberto = doc // valor_pago não populado: usa o documento (igual à lista)
        return {
          tipo, codigo_lancamento: r.codigo_lancamento, conta_omie: r.conta_omie, numero_documento: r.numero_documento,
          numero_documento_fiscal: r.numero_documento_fiscal, numero_parcela: r.numero_parcela, descricao_categoria: r.descricao_categoria,
          data_vencimento: r.data_vencimento, valor_documento: doc, valor_pago: pago, valor_aberto: aberto, parcial: pago > 0.01,
          dias_atraso: Math.max(0, Math.round(dia(hoje) - dia(r.data_vencimento))), status_titulo: r.status_titulo,
          id_conta_corrente: r.id_conta_corrente != null ? Number(r.id_conta_corrente) : null,
        }
      })
    return NextResponse.json({ titulos })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
