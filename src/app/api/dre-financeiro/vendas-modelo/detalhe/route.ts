// =============================================================================
// API: vendas-modelo/detalhe - port FIEL de GET /api/vendas-modelo/detalhe do
// server.js (linhas 2428-2503). Lista cada venda (data, cliente, descricao,
// qtd, valor) de um conjunto de modelos (variantes do grupo) num mes/ano.
// Usado pelo popup ao clicar numa qty/mes na tela /dre-financeiro/vendas-modelo.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO,
  selectPaginado,
  carregarPedidosInvalidos,
  pedidoEhInvalido,
} from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// pegaConta reimplementado inline (server.js:68-72): le searchParams 'conta',
// senao cookie, senao default. Valores: nova|castro|todas.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const db = supabase // alias non-null: TS nao narrow 'supabase' dentro do closure de selectPaginado
  try {
    const sp = request.nextUrl.searchParams
    const ano = parseInt(sp.get('ano') || '', 10)
    const mes = parseInt(sp.get('mes') || '', 10)
    if (!ano || !mes || mes < 1 || mes > 12) return NextResponse.json({ erro: 'ano/mes invalidos' }, { status: 400 })
    const conta = (sp.get('conta') || pegaConta(request)).toString().toLowerCase()
    const contaSlug = conta === 'todas' ? null : conta
    const modelosParam = (sp.get('modelos') || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!modelosParam.length) return NextResponse.json({ erro: 'informe modelos=mod1,mod2' }, { status: 400 })

    // 1) codigo_produtos que mapeiam pra esses modelos (em produtos.modelo)
    // Filtra fora pecas - alguns filtros/pecas tem produtos.modelo='5050' por erro de
    // cadastro no Omie e cairiam no popup quando user clica no modelo do trator.
    // Mesmo criterio do calcularVendasPorModelo: ignora familia_nome que comeca com "Peç".
    let qp = db.from('produtos').select('codigo_produto,familia_nome').in('modelo', modelosParam)
    if (contaSlug) qp = qp.eq('conta_omie', contaSlug)
    const { data: ps, error: e1 } = await qp
    if (e1) throw e1
    function isPeca(f: any) {
      return /^pe[çc]/.test(String(f || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
    }
    const codigosSet = new Set(
      (ps || []).filter((p: any) => !isPeca(p.familia_nome)).map((p: any) => String(p.codigo_produto))
    )

    // 2) Vendas do mes/conta -- depois filtra por codigo OU descricao (fallback p/ produtos sem modelo)
    const vendasRaw = await selectPaginado(() => {
      let q = db.from('vendas_itens')
        .select('numero_pedido,data_pedido,descricao,codigo_produto,codigo_cliente,quantidade,valor_total,cmc_unitario,nome_cliente,familia,conta_omie')
        .eq('ano', ano).eq('mes', mes)
      if (contaSlug) q = q.ilike('conta_omie', contaSlug)
      return q
    })
    const modelosSet = new Set(modelosParam)
    const pedInvalidos = await carregarPedidosInvalidos()
    const vendas = vendasRaw
      .filter((v: any) => codigosSet.has(String(v.codigo_produto)) || modelosSet.has(String(v.descricao || '').trim()))
      .filter((v: any) => !pedidoEhInvalido(pedInvalidos, v.conta_omie, v.numero_pedido))
      .sort((a: any, b: any) => String(a.data_pedido).localeCompare(String(b.data_pedido)))

    // 3) Resolve nome do cliente pelo codigo_cliente quando nome_cliente esta vazio.
    // vendas_itens.nome_cliente vem direto do Omie e frequentemente vem null/vazio;
    // a tabela `clientes` tem razao_social/nome_fantasia mais confiavel.
    const codigosCliente = Array.from(new Set(
      vendas.map((v: any) => v.codigo_cliente).filter(Boolean).map(String)
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
      s.valor += Number(v.valor_total) || 0
      s.qtd += Number(v.quantidade) || 0
      s.eventos += 1
      return s
    }, { valor: 0, qtd: 0, eventos: 0 })

    return NextResponse.json({ ano, mes, conta, modelos: modelosParam, count: vendas.length, totais, vendas })
  } catch (e: any) {
    console.error('vendas-modelo/detalhe:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
