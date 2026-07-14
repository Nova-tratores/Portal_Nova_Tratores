// =============================================================================
// API: detalhe (drill-down) dos movimentos da DRE Competencia para um mes/ano e
// classificacao. Port FIEL de GET /api/dre-competencia/detalhe do server.js
// (linhas 3048-3171). Busca direto em vendas_itens + contas_pagar, filtrando
// pelos mesmos criterios do calcularDRECompetencia (exclui intercompany e
// pedidos invalidos).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { selectPaginado, carregarPedidosInvalidos, pedidoEhInvalido } from '@/lib/dre-financeiro/calc'
import { EMPRESAS_GRUPO_CNPJ, cnpjOutraEmpresa, mapaUsuariosOmie } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const db = supabase // alias nao-null p/ uso dentro dos closures de selectPaginado
  try {
    const sp = request.nextUrl.searchParams
    const ano = parseInt(sp.get('ano') || '', 10)
    const mes = parseInt(sp.get('mes') || '', 10)
    if (!ano || !mes || mes < 1 || mes > 12) return NextResponse.json({ erro: 'ano/mes invalidos' }, { status: 400 })
    const filtroTipo = sp.get('dre_tipo') || null
    const filtroGrupo = sp.get('dre_grupo') || null
    const filtroConta = sp.get('dre_conta') || null
    const filtroCategoria = sp.get('dre_categoria') || null
    // Exclusao: usado pela linha "03. Despesas Financeiras" limpa do grafico,
    // que separa "Pagamento de Emprestimos" em serie propria.
    const filtroCategoriaNe = sp.get('dre_categoria_ne') || null

    function matchesClassif(tipo: string, grupo: string, conta: string) {
      if (filtroTipo && tipo !== filtroTipo) return false
      if (filtroGrupo && grupo !== filtroGrupo) return false
      if (filtroConta && conta !== filtroConta) return false
      return true
    }

    const movimentos: any[] = []

    // Vendas (Receita/CMV) nao tem categoria no nosso modelo - se ha filtro por
    // categoria, vendas sao puladas inteiramente.
    const includeReceita = !filtroCategoria && matchesClassif('1. Lucro Bruto', '01. Receita Líquida Operacional', '01. Receita Bruta de Vendas')
    const includeCMV = !filtroCategoria && matchesClassif('1. Lucro Bruto', '21. Custos', '01. Custo Médio (CMC) das Vendas')

    // 1. Vendas (Receita Bruta + CMV) - exclui intercompany igual ao consolidado
    if (includeReceita || includeCMV) {
      const interSet: Record<string, Set<number>> = { nova: new Set(), castro: new Set() }
      try {
        const { data: clientesInter } = await db.from('clientes')
          .select('codigo_cliente_omie,conta_omie,cnpj_norm')
          .in('cnpj_norm', [EMPRESAS_GRUPO_CNPJ.nova, EMPRESAS_GRUPO_CNPJ.castro])
        ;(clientesInter || []).forEach((c: any) => {
          const slug = String(c.conta_omie || '').toLowerCase()
          const cnpjOutra = cnpjOutraEmpresa(slug)
          if (cnpjOutra && c.cnpj_norm === cnpjOutra && interSet[slug]) {
            interSet[slug].add(Number(c.codigo_cliente_omie))
          }
        })
      } catch (e: any) { console.warn('[dre-comp/detalhe] clientes:', e.message) }

      const vendasRaw = await selectPaginado(() =>
        db.from('vendas_itens')
          .select('valor_total,quantidade,cmc_unitario,nome_cliente,data_pedido,numero_pedido,familia,descricao,conta_omie,codigo_cliente')
          .eq('ano', ano).eq('mes', mes)
          .order('id', { ascending: true }) // ordem estavel p/ paginacao
      )
      const pedInvalidos = await carregarPedidosInvalidos()
      const vendas = vendasRaw.filter((v: any) => !pedidoEhInvalido(pedInvalidos, v.conta_omie, v.numero_pedido))
      vendas.forEach((v: any) => {
        const slug = String(v.conta_omie || '').toLowerCase()
        if (slug !== 'nova' && slug !== 'castro') return
        const codCli = Number(v.codigo_cliente)
        const isInter = codCli && interSet[slug].has(codCli)
        if (isInter) return
        const baseRow = {
          dataMovimento: v.data_pedido,
          _conta_omie: slug,
          nomeClienteFornecedor: v.nome_cliente,
          categoria: v.familia || v.descricao,
          numeroDocumento: v.numero_pedido,
        }
        if (includeReceita) {
          const r = Number(v.valor_total) || 0
          if (r) movimentos.push({ ...baseRow, dreConta: '01. Receita Bruta de Vendas', valor: r })
        }
        if (includeCMV) {
          const c = -((Number(v.cmc_unitario) || 0) * (Number(v.quantidade) || 0))
          if (c) movimentos.push({ ...baseRow, dreConta: '01. Custo Médio (CMC) das Vendas', valor: c })
        }
      })
    }

    // 2. Contas a pagar (despesas + devolucoes)
    const grupoCpClassif: Record<string, { tipo: string; grupo: string; conta: string; sinal: number }> = {
      'Devoluções de Vendas': { tipo: '1. Lucro Bruto', grupo: '01. Receita Líquida Operacional', conta: '03. Deduções de Receita', sinal: -1 },
      'Despesas com Pessoal': { tipo: '2. Despesas', grupo: '11. Fixas', conta: '01. Despesas com Pessoal', sinal: -1 },
      'Despesas Administrativas': { tipo: '2. Despesas', grupo: '11. Fixas', conta: '02. Despesas Administrativas', sinal: -1 },
      'Despesas Financeiras / Bancos': { tipo: '2. Despesas', grupo: '11. Fixas', conta: '03. Despesas Financeiras', sinal: -1 },
      'Despesas de Vendas e Marketing': { tipo: '2. Despesas', grupo: '11. Fixas', conta: '04. Despesas de Vendas e Marketing', sinal: -1 },
      'Outras Despesas': { tipo: '2. Despesas', grupo: '11. Fixas', conta: '05. Outras Despesas', sinal: -1 },
      'Impostos e Taxas': { tipo: '2. Despesas', grupo: '11. Fixas', conta: '06. Impostos e Taxas', sinal: -1 },
    }
    const gruposParaCarregar = Object.entries(grupoCpClassif)
      .filter(([, cls]) => matchesClassif(cls.tipo, cls.grupo, cls.conta))
      .map(([g]) => g)

    if (gruposParaCarregar.length > 0) {
      const dataDe = `${ano}-${String(mes).padStart(2, '0')}-01`
      const ultDia = new Date(ano, mes, 0).getDate()
      const dataAte = `${ano}-${String(mes).padStart(2, '0')}-${String(ultDia).padStart(2, '0')}`
      const cps = await selectPaginado(() =>
        db.from('contas_pagar')
          .select('valor_documento,data_emissao,conta_omie,grupo_categoria,descricao_categoria,nome_fornecedor,numero_documento,status_titulo,incluido_por')
          .gte('data_emissao', dataDe).lte('data_emissao', dataAte)
          .in('grupo_categoria', gruposParaCarregar)
          .order('codigo_lancamento', { ascending: true })
          .order('conta_omie', { ascending: true }) // ordem estavel p/ paginacao (evita duplicar)
      )
      // Mapa codigo Omie -> nome (para exibir "incluido por" com nome legivel).
      const usuarios: Record<string, string> = await mapaUsuariosOmie()
      cps.forEach((r: any) => {
        // Titulos cancelados no Omie nao entram na DRE (ver calcularDRECompetencia)
        if (String(r.status_titulo || '').toUpperCase().includes('CANCEL')) return
        const cls = grupoCpClassif[r.grupo_categoria]; if (!cls) return
        const v = cls.sinal * (Number(r.valor_documento) || 0); if (!v) return
        const cat = r.descricao_categoria || '(sem categoria)'
        if (filtroCategoria && cat !== filtroCategoria) return
        if (filtroCategoriaNe && cat === filtroCategoriaNe) return
        movimentos.push({
          dataMovimento: r.data_emissao,
          _conta_omie: String(r.conta_omie || '').toLowerCase(),
          nomeClienteFornecedor: r.nome_fornecedor,
          categoria: cat,
          dreConta: cls.conta,
          numeroDocumento: r.numero_documento,
          incluidoPor: usuarios[r.incluido_por] || r.incluido_por || null,
          valor: v,
        })
      })
    }

    // 3. Lancamentos de conta corrente SEM titulo (movimentos_cc, codigo_titulo=0)
    // - espelha o passo 4c de calcularDRECompetencia (ex.: juros da antecipacao
    // de duplicatas), para o modal bater com a arvore. Graceful: tabela ausente
    // ou vazia nao quebra o drill-down.
    try {
      const dataDe = `${ano}-${String(mes).padStart(2, '0')}-01`
      const ultDia = new Date(ano, mes, 0).getDate()
      const dataAte = `${ano}-${String(mes).padStart(2, '0')}-${String(ultDia).padStart(2, '0')}`
      const lancCC = await selectPaginado(() =>
        db.from('movimentos_cc')
          .select('conta_omie,data_pagamento,valor_pago,grupo_categoria,descricao_categoria,status,nome_cliente_fornecedor,nome_conta_corrente,numero_documento')
          .eq('natureza', 'P')
          .eq('codigo_titulo', 0)
          .gte('data_pagamento', dataDe).lte('data_pagamento', dataAte)
          .not('grupo_categoria', 'is', null)
          .order('id', { ascending: true })
      )
      ;(lancCC || []).forEach((r: any) => {
        if (String(r.status || '').toUpperCase().includes('CANCEL')) return
        const cls = grupoCpClassif[r.grupo_categoria]; if (!cls) return
        if (!matchesClassif(cls.tipo, cls.grupo, cls.conta)) return
        const v = cls.sinal * (Number(r.valor_pago) || 0); if (!v) return
        const cat = r.descricao_categoria || '(sem categoria)'
        if (filtroCategoria && cat !== filtroCategoria) return
        if (filtroCategoriaNe && cat === filtroCategoriaNe) return
        movimentos.push({
          dataMovimento: r.data_pagamento,
          _conta_omie: String(r.conta_omie || '').toLowerCase(),
          nomeClienteFornecedor: r.nome_cliente_fornecedor || r.nome_conta_corrente || '(lançamento conta corrente)',
          categoria: cat,
          dreConta: cls.conta,
          numeroDocumento: r.numero_documento,
          incluidoPor: null,
          valor: v,
        })
      })
    } catch (e: any) { console.warn('[dre-comp/detalhe] lancamentos CC:', e.message) }

    movimentos.sort((a, b) => Math.abs(Number(b.valor) || 0) - Math.abs(Number(a.valor) || 0))
    const total = movimentos.reduce((s, m) => s + (Number(m.valor) || 0), 0)
    return NextResponse.json({
      ano, mes, regime: 'competencia',
      filtros: { dre_tipo: filtroTipo, dre_grupo: filtroGrupo, dre_conta: filtroConta, dre_categoria: filtroCategoria, dre_categoria_ne: filtroCategoriaNe },
      total, count: movimentos.length, movimentos,
    })
  } catch (e: any) {
    console.error('dre-competencia/detalhe:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
