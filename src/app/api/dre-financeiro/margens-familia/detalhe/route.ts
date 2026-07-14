// =============================================================================
// API: margens-familia/detalhe - lista as vendas (vendas_itens) que compoem o
// ponto clicado no grafico "Evolucao da margem por familia" da tela DRE.
// Recebe meses=YYYY-MM,... (a unidade pode ser mes/trimestre/ano) e
// familias=A,B,... (nomes JA normalizados; "Outros" vira a lista das familias
// fora do top-6). Filtra com a MESMA regra do agregado (familiaNormalizada +
// pedidos invalidos) para o detalhe bater com o valor do grafico.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO,
  selectPaginado,
  familiaNormalizada,
  carregarPedidosInvalidos,
  pedidoEhInvalido,
} from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const db = supabase
  try {
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const contaSlug = conta === 'todas' ? null : conta

    const meses = (sp.get('meses') || '').split(',').map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}$/.test(s))
    if (!meses.length) return NextResponse.json({ erro: 'informe meses=YYYY-MM,...' }, { status: 400 })
    const familiasParam = (sp.get('familias') || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!familiasParam.length) return NextResponse.json({ erro: 'informe familias=fam1,fam2' }, { status: 400 })
    const familiasSet = new Set(familiasParam)

    // Vendas dos meses pedidos (or-filter ano/mes, igual calcularMargensPorFamilia)
    const pares = meses.map((k) => ({ ano: parseInt(k.slice(0, 4), 10), mes: parseInt(k.slice(5, 7), 10) }))
    const vendasRaw = await selectPaginado(() => {
      let q = db.from('vendas_itens')
        .select('numero_pedido,data_pedido,descricao,codigo_produto,codigo_cliente,nome_cliente,quantidade,valor_total,cmc_unitario,familia,conta_omie')
      const orFilter = pares.map((p) => `and(ano.eq.${p.ano},mes.eq.${p.mes})`).join(',')
      q = q.or(orFilter)
      if (contaSlug) q = q.ilike('conta_omie', contaSlug)
      return q.order('id', { ascending: true }) // ordem estavel p/ paginacao
    })

    const invalidos = await carregarPedidosInvalidos()
    const vendas = vendasRaw
      .filter((v: any) => {
        const fam = familiaNormalizada(v.familia)
        return fam !== null && familiasSet.has(fam)
      })
      .filter((v: any) => !pedidoEhInvalido(invalidos, v.conta_omie, v.numero_pedido))
      .map((v: any) => {
        const receita = Number(v.valor_total) || 0
        const custo = v.cmc_unitario == null ? null : (Number(v.cmc_unitario) || 0) * (Number(v.quantidade) || 0)
        return { ...v, familia_norm: familiaNormalizada(v.familia), custo, lucro: custo == null ? null : receita - custo }
      })
      .sort((a: any, b: any) => String(a.data_pedido).localeCompare(String(b.data_pedido)))

    // Resolve nome do cliente quando nome_cliente veio vazio do Omie (a tabela
    // `clientes` tem razao_social/nome_fantasia mais confiavel).
    const codigosCliente = Array.from(new Set(
      vendas.filter((v: any) => !v.nome_cliente && v.codigo_cliente).map((v: any) => String(v.codigo_cliente))
    )) as string[]
    const clienteMap: Record<string, string | null> = {}
    for (let i = 0; i < codigosCliente.length; i += 500) {
      const lote = codigosCliente.slice(i, i + 500)
      const { data: cs } = await db.from('clientes')
        .select('codigo_cliente_omie,razao_social,nome_fantasia')
        .in('codigo_cliente_omie', lote)
      ;(cs || []).forEach((c: any) => {
        clienteMap[String(c.codigo_cliente_omie)] = c.razao_social || c.nome_fantasia || null
      })
    }
    vendas.forEach((v: any) => {
      if (!v.nome_cliente && v.codigo_cliente && clienteMap[String(v.codigo_cliente)]) {
        v.nome_cliente = clienteMap[String(v.codigo_cliente)]
      }
    })

    const totais = vendas.reduce((s: any, v: any) => {
      s.receita += Number(v.valor_total) || 0
      s.custo += v.custo || 0
      s.qtd += Number(v.quantidade) || 0
      if (v.custo == null) s.semCusto += 1
      return s
    }, { receita: 0, custo: 0, qtd: 0, semCusto: 0 })
    totais.lucro = totais.receita - totais.custo
    totais.margem = totais.receita > 0 ? (totais.lucro / totais.receita) * 100 : null

    return NextResponse.json({ conta, meses, familias: familiasParam, count: vendas.length, totais, vendas })
  } catch (e: any) {
    console.error('margens-familia/detalhe:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
