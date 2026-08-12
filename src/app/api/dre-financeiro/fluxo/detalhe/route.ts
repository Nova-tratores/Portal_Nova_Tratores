// =============================================================================
// API: detalhe de um "fluxo" do Sankey.
// Port FIEL de GET /api/fluxo/detalhe do server.js (linhas 1245-1311).
// Lista os titulos que compoem um grupo / categoria / terceiro dentro do
// periodo de+ate. Filtros opcionais: grupo (na query), categoria e terceiro
// (em memoria, por causa do fallback descricao/codigo). Acumula total no topo.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO,
  tabelaPorTipo, colunaNomePorTipo, aplicarConta, selectPaginado,
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

// Espelha o tratamento da antecipacao feito na rota /fluxo (ver comentario la): o
// PRINCIPAL APIP e' removido do fluxo; so' o JURO (de movimentos_cc) sobra em
// "Despesas Financeiras / Bancos". Inline pra correcao autocontida.
const CAT_JURO_ANTECIP = 'Juros de antecipação de duplicatas'
const GRUPO_DESP_FIN = 'Despesas Financeiras / Bancos'
function ehDescontoDuplicataAPIP(r: any): boolean {
  return String(r?.codigo_categoria || '') === '2.05.03' && String(r?.id_origem || '') === 'APIP'
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const tipo = String(sp.get('tipo') || '').toLowerCase()
    if (!['pagar', 'receber'].includes(tipo)) return NextResponse.json({ erro: 'tipo deve ser pagar ou receber' }, { status: 400 })
    const ini = sp.get('de') ? String(sp.get('de')) : null
    const fim = sp.get('ate') ? String(sp.get('ate')) : null
    if (!ini || !fim) return NextResponse.json({ erro: 'informe de e ate (YYYY-MM-DD)' }, { status: 400 })
    const grupoFiltro = sp.get('grupo') ? String(sp.get('grupo')) : null
    const categoriaFiltro = sp.get('categoria') ? String(sp.get('categoria')) : null
    const terceiroFiltro = sp.get('terceiro') ? String(sp.get('terceiro')) : null
    const limit = Math.max(10, Math.min(500, parseInt(sp.get('limit') || '', 10) || 100))

    // Nó sintético do JURO da antecipacao: nao vem de contas_pagar e sim de
    // movimentos_cc (lancamento de CC sem titulo). Mesma fonte da rota /fluxo.
    if (tipo === 'pagar' && grupoFiltro === GRUPO_DESP_FIN && categoriaFiltro === CAT_JURO_ANTECIP) {
      const juros = await selectPaginado(() => {
        let q = supabase!.from('movimentos_cc')
          .select('valor_pago,data_pagamento,descricao_categoria,nome_conta_corrente,status,conta_omie')
          .eq('natureza', 'P').eq('codigo_titulo', 0)
          .ilike('nome_conta_corrente', '%Desconto de Duplicata%')
          .not('grupo_categoria', 'is', null)
          .gte('data_pagamento', ini).lte('data_pagamento', fim)
          .order('id')
        if (conta !== 'todas') q = q.eq('conta_omie', conta.toUpperCase())
        return q
      })
      const rows = (juros || []).filter((r: any) => {
        if (String(r.status || '').toUpperCase().includes('CANCEL')) return false
        if (/transfer/i.test(String(r.descricao_categoria || ''))) return false
        if ((Number(r.valor_pago) || 0) <= 0) return false
        if (terceiroFiltro && String(r.nome_conta_corrente || 'Antecipação') !== terceiroFiltro) return false
        return true
      })
      rows.sort((a: any, b: any) => (Number(b.valor_pago) || 0) - (Number(a.valor_pago) || 0))
      const totalJ = rows.reduce((s: number, r: any) => s + (Number(r.valor_pago) || 0), 0)
      return NextResponse.json({
        tipo, conta, de: ini, ate: fim,
        filtros: { grupo: grupoFiltro, categoria: categoriaFiltro, terceiro: terceiroFiltro },
        total: totalJ, qtd: rows.length,
        titulos: rows.slice(0, limit).map((r: any) => ({
          codigo: null, nf: null, parcela: null,
          vencimento: r.data_pagamento || null, emissao: r.data_pagamento || null,
          valor: Number(r.valor_pago) || 0, valor_pago: Number(r.valor_pago) || 0,
          status: r.status || null,
          terceiro: r.nome_conta_corrente || 'Antecipação',
          grupo: grupoFiltro, categoria: CAT_JURO_ANTECIP,
        })),
      })
    }

    const tabela = tabelaPorTipo(tipo)
    const colNome = colunaNomePorTipo(tipo)
    // PAGINAR (mesma armadilha do /fluxo): o .limit(50000) nao escapa do corte de
    // 1000 linhas do PostgREST -> o `total` de qualquer periodo anual vinha
    // subestimado. selectPaginado com .order('id') (chave estavel obrigatoria).
    const data = await selectPaginado(() => {
      let q = supabase!.from(tabela)
        .select(`codigo_lancamento,data_vencimento,data_emissao,valor_documento,valor_pago,status_titulo,grupo_categoria,descricao_categoria,codigo_categoria,${colNome},numero_documento_fiscal,numero_parcela,id_origem:raw->>id_origem`)
        .gte('data_vencimento', ini).lte('data_vencimento', fim)
        .order('id')
      q = aplicarConta(q, conta)
      // Aplica grupo direto na query (campo simples). Categoria e terceiro filtra
      // em memoria por causa do fallback descricao/codigo (mesma logica da agregacao).
      if (grupoFiltro) q = q.eq('grupo_categoria', grupoFiltro)
      return q
    })

    const SEM_CAT = 'Sem categoria', SEM_TERC = 'Sem nome'
    const filtered = (data || []).filter((r: any) => {
      if ((Number(r.valor_documento) || 0) <= 0) return false
      // Principal APIP foi REMOVIDO do fluxo: ao abrir "Despesas Financeiras /
      // Bancos" os titulos-principal nao devem reaparecer (so' o juro, servido do
      // ramo de movimentos_cc acima).
      if (grupoFiltro === GRUPO_DESP_FIN && ehDescontoDuplicataAPIP(r)) return false
      if (categoriaFiltro) {
        const c = r.descricao_categoria || r.codigo_categoria || SEM_CAT
        if (String(c) !== categoriaFiltro) return false
      }
      if (terceiroFiltro) {
        const t = r[colNome] || SEM_TERC
        if (String(t) !== terceiroFiltro) return false
      }
      return true
    })
    const total = filtered.reduce((s: number, r: any) => s + (Number(r.valor_documento) || 0), 0)
    filtered.sort((a: any, b: any) => (Number(b.valor_documento) || 0) - (Number(a.valor_documento) || 0))

    return NextResponse.json({
      tipo, conta, de: ini, ate: fim,
      filtros: { grupo: grupoFiltro, categoria: categoriaFiltro, terceiro: terceiroFiltro },
      total,
      qtd: filtered.length,
      titulos: filtered.slice(0, limit).map((r: any) => ({
        codigo: r.codigo_lancamento,
        nf: r.numero_documento_fiscal || null,
        parcela: r.numero_parcela || null,
        vencimento: r.data_vencimento || null,
        emissao: r.data_emissao || null,
        valor: Number(r.valor_documento) || 0,
        valor_pago: Number(r.valor_pago) || 0,
        status: r.status_titulo || null,
        terceiro: r[colNome] || null,
        grupo: r.grupo_categoria || null,
        categoria: r.descricao_categoria || r.codigo_categoria || null
      }))
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
