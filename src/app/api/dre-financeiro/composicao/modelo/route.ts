// =============================================================================
// API: composicao/modelo - visao "por Modelo" do popup da Composicao.
//
// A Composicao vem 100% de titulos financeiros (contas_pagar/receber), que NAO
// tem modelo de trator. "Modelo" so existe em vendas_itens + produtos.modelo.
// Como as duas bases nao tem chave 1:1, cruzamos por PERIODO + CLIENTE:
//   1) pega os codigos de cliente dos titulos daquela categoria de RECEITA no
//      periodo (contas_receber.codigo_cliente_fornecedor);
//   2) busca as vendas desses mesmos clientes no mesmo periodo (vendas_itens por
//      data_pedido) e agrega por modelo (via produtos.modelo, sem pecas).
//
// => APROXIMADO por definicao: o total por modelo NAO bate com o valor
// financeiro da categoria (regime de caixa x competencia, titulos parciais, um
// cliente pode ter titulos de servico/pecas na mesma categoria). Devolvemos os
// dois totais (financeiro x vendas) pra tela deixar isso explicito.
//
// So faz sentido para categorias de RECEITA (tipo=receber). A tela so oferece a
// aba "Modelo" nesses casos.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, aplicarConta, selectPaginado,
  carregarPedidosInvalidos, pedidoEhInvalido,
} from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

const SEM_GRUPO = 'Sem grupo'
const SEM_CAT = 'Sem categoria'

function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

// Peca mal-classificada as vezes tem produtos.modelo preenchido (erro de cadastro
// no Omie) e vazaria como "modelo de trator". Mesmo criterio do calc/vendas-modelo.
function isPeca(f: any) {
  return /^pe[çc]/.test(String(f || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
}

// Meses (ano/mes) que um intervalo ISO toca — granularidade MENSAL de propósito:
// vendas_itens.data_pedido vem em DD/MM/YYYY (não ISO), então não dá pra filtrar
// por range de texto; a tela Vendas/Modelo também agrega por ano/mes.
function mesesNoIntervalo(de: string, ate: string): { ano: number, mes: number }[] {
  const [ay, am] = de.split('-').map(Number)
  const [by, bm] = ate.split('-').map(Number)
  const out: { ano: number, mes: number }[] = []
  let y = ay, m = am
  while (y < by || (y === by && m <= bm)) {
    out.push({ ano: y, mes: m })
    m++; if (m > 12) { m = 1; y++ }
    if (out.length > 240) break // guarda contra intervalo absurdo (20 anos)
  }
  return out
}

// DD/MM/YYYY -> YYYY-MM-DD (só para ordenar as vendas por data no drill).
function isoKey(br: string): string {
  if (!br) return ''
  const p = String(br).split('/')
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : String(br)
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const db = supabase
  try {
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const contaSlug = conta === 'todas' ? null : conta
    const de = sp.get('de') ? String(sp.get('de')) : ''
    const ate = sp.get('ate') ? String(sp.get('ate')) : ''
    const grupo = sp.get('grupo') || ''
    const categoria = sp.get('categoria') || ''
    if (!de || !ate) return NextResponse.json({ erro: 'informe de/ate' }, { status: 400 })

    // -------------------------------------------------------------------------
    // 1) Titulos da categoria (RECEITA) no periodo -> codigos de cliente + total
    //    financeiro. Mesmo filtro/resolucao da rota /composicao (tipo=receber).
    // -------------------------------------------------------------------------
    const titulos = await selectPaginado(() => {
      let q = db.from('contas_receber')
        .select('codigo_cliente_fornecedor,nome_cliente,descricao_categoria,codigo_categoria,valor_documento')
        .gte('data_vencimento', de).lte('data_vencimento', ate)
        .order('codigo_lancamento')
      q = aplicarConta(q, conta)
      if (grupo === SEM_GRUPO) q = q.is('grupo_categoria', null)
      else if (grupo) q = q.eq('grupo_categoria', grupo)
      return q
    })

    const clienteNome: Record<string, string> = {}
    const codigosCliente = new Set<string>()
    let totalFinanceiro = 0
    titulos.forEach((r: any) => {
      const v = Number(r.valor_documento) || 0
      if (v <= 0) return
      const cat = r.descricao_categoria || (r.codigo_categoria || SEM_CAT)
      if (cat !== categoria) return
      totalFinanceiro += v
      const cod = r.codigo_cliente_fornecedor
      if (cod != null) {
        const k = String(cod)
        codigosCliente.add(k)
        if (r.nome_cliente && !clienteNome[k]) clienteNome[k] = r.nome_cliente
      }
    })

    if (codigosCliente.size === 0) {
      return NextResponse.json({
        de, ate, grupo, categoria, totalFinanceiro, totalVendas: 0,
        clientes: 0, modelos: [], aviso: 'Nenhum cliente com código nos títulos desta categoria.',
      })
    }

    // -------------------------------------------------------------------------
    // 2) Vendas desses clientes no mesmo periodo. Filtra por ano/mes (data_pedido
    //    e' DD/MM/YYYY, ver mesesNoIntervalo). vendas_itens.conta_omie e' UPPERCASE
    //    -> ilike. codigo_cliente e' TEXT e casa com codigo_cliente_fornecedor
    //    (mesmo codigo Omie do cliente). .in() em lotes.
    // -------------------------------------------------------------------------
    const meses = mesesNoIntervalo(de, ate)
    const orMeses = meses.map((m) => `and(ano.eq.${m.ano},mes.eq.${m.mes})`).join(',')
    const codigosArr = Array.from(codigosCliente)
    const vendasRaw: any[] = []
    for (let i = 0; i < codigosArr.length; i += 300) {
      const lote = codigosArr.slice(i, i + 300)
      const parte = await selectPaginado(() => {
        let q = db.from('vendas_itens')
          .select('codigo_produto,descricao,valor_total,quantidade,data_pedido,codigo_cliente,nome_cliente,familia,conta_omie,numero_pedido')
          .or(orMeses)
          .in('codigo_cliente', lote)
        if (contaSlug) q = q.ilike('conta_omie', contaSlug)
        return q
      })
      vendasRaw.push(...parte)
    }

    // Descarta pedidos cancelados/devolvidos (mesma regra das outras telas).
    const invalidos = await carregarPedidosInvalidos()
    const vendas = vendasRaw.filter((v) => !pedidoEhInvalido(invalidos, v.conta_omie, v.numero_pedido))

    // Mapa codigo_produto -> { modelo, familia_nome }
    const codProd = Array.from(new Set(vendas.map((v: any) => String(v.codigo_produto))))
    const produtoMap: Record<string, { modelo: string | null, familia_nome: string | null }> = {}
    for (let i = 0; i < codProd.length; i += 500) {
      const lote = codProd.slice(i, i + 500)
      const { data: ps } = await db.from('produtos')
        .select('codigo_produto,modelo,familia_nome').in('codigo_produto', lote)
      ;(ps || []).forEach((p: any) => {
        produtoMap[String(p.codigo_produto)] = {
          modelo: p.modelo ? String(p.modelo).trim() : null,
          familia_nome: p.familia_nome ? String(p.familia_nome).trim() : null,
        }
      })
    }

    // -------------------------------------------------------------------------
    // 3) Agrega por modelo (exige modelo cadastrado e nao ser peca).
    // -------------------------------------------------------------------------
    const acc: Record<string, any> = {}
    let totalVendas = 0
    vendas.forEach((v: any) => {
      const prod = produtoMap[String(v.codigo_produto)] || {}
      const fam = prod.familia_nome || v.familia
      if (!prod.modelo || isPeca(fam)) return
      const modelo = prod.modelo
      const receita = Number(v.valor_total) || 0
      const qty = Number(v.quantidade) || 0
      totalVendas += receita
      if (!acc[modelo]) acc[modelo] = { modelo, familia: fam || '', valor: 0, qtd: 0, eventos: 0, vendas: [] }
      const m = acc[modelo]
      m.valor += receita
      m.qtd += qty
      m.eventos += 1
      const codCli = String(v.codigo_cliente || '')
      m.vendas.push({
        data: v.data_pedido || null,
        cliente: v.nome_cliente || clienteNome[codCli] || 'Sem nome',
        descricao: v.descricao || '',
        quantidade: qty,
        valor: receita,
      })
    })

    const modelos = Object.values(acc)
      .map((m: any) => { m.vendas.sort((a: any, b: any) => isoKey(b.data).localeCompare(isoKey(a.data))); return m })
      .sort((a: any, b: any) => b.valor - a.valor)

    return NextResponse.json({
      de, ate, grupo, categoria,
      totalFinanceiro, totalVendas,
      clientes: codigosCliente.size,
      modelos,
    })
  } catch (e: any) {
    console.error('composicao/modelo:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
