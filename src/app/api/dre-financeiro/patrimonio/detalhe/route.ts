// =============================================================================
// API: patrimonio/detalhe - port FIEL de GET /api/patrimonio/detalhe do
// server.js (linhas 1824-2048). Detalhamento de um componente do patrimonio
// (top itens). item: pecas | maquinas | frota | a_receber | a_pagar | balanco |
// patrimonio. Para a_receber/a_pagar agrega por cliente/fornecedor, excluindo
// intercompany (NOVA/CASTRO) e titulos sem cliente identificado.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO,
  selectPaginado, calcularPatrimonio, calcularCobertura, familiaNormalizada,
} from '@/lib/dre-financeiro/calc'
import { labelConta, EMPRESAS_GRUPO_CNPJ } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

// pegaConta reimplementado inline (server.js:68-77): le searchParams 'conta',
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
  const db = supabase // ref nao-null p/ uso dentro de closures (TS nao estreita supabase em callbacks)
  try {
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const item = String(sp.get('item') || '').toLowerCase()
    const limit = Math.max(5, Math.min(100, parseInt(sp.get('limit') || '', 10) || 20))
    const contaLabel = conta === 'todas' ? null : labelConta(conta)
    const contaSlug = conta === 'todas' ? null : String(conta).toLowerCase()

    if (item === 'frota') {
      const data = await selectPaginado(() => db.from('Placas')
        .select('NumPlaca,modelo,ano,valor_mercado,ativo,frota_tipo,ambiente,combustivel'))
      const ativos = data.filter((p: any) => p.ativo !== false).sort((a: any, b: any) => (b.valor_mercado || 0) - (a.valor_mercado || 0))
      return NextResponse.json({
        item, conta,
        descricao: 'Tabela "Placas" do projeto Visual Estoque. Inclui caminhoes, carros, motos. Frota e compartilhada entre todas as contas Omie.',
        formula: 'SUM(valor_mercado) WHERE ativo != false',
        total: ativos.reduce((s: number, p: any) => s + (Number(p.valor_mercado) || 0), 0),
        qtd: ativos.length,
        itens: ativos.slice(0, limit).map((p: any) => ({
          rotulo: p.NumPlaca,
          subtitulo: [p.modelo, p.ano, p.frota_tipo, p.ambiente, p.combustivel].filter(Boolean).join(' · '),
          valor: Number(p.valor_mercado) || 0,
        })),
      })
    }

    if (item === 'pecas' || item === 'maquinas') {
      const prods = await selectPaginado(() => {
        let q = db.from('produtos').select('codigo_produto,valor_estoque,estoque,modelo,conta_omie')
        if (contaSlug) q = q.eq('conta_omie', contaSlug)
        return q.gt('valor_estoque', 0)
      })
      const tipos = await selectPaginado(() => {
        let q = db.from('produto_tipo').select('codigo_produto,familia,conta_omie')
        if (contaSlug) q = q.ilike('conta_omie', contaSlug)
        return q
      })
      const mapaFamilia: Record<string, string> = {}
      tipos.forEach((t: any) => {
        const f = familiaNormalizada(t.familia)
        if (f !== null) mapaFamilia[`${String(t.conta_omie).toLowerCase()}|${t.codigo_produto}`] = f
      })
      function isPeca(f: any) { return /^pe[çc]/.test(String(f || '').toLowerCase()) }
      const filtrados = prods.filter((p: any) => {
        const cs = String(p.conta_omie || '').toLowerCase()
        const f = mapaFamilia[`${cs}|${p.codigo_produto}`] || 'Peças'
        return item === 'pecas' ? isPeca(f) : !isPeca(f)
      })
      // Descricoes
      const codigos = filtrados.map((p: any) => String(p.codigo_produto))
      const descMap: Record<string, any> = {}
      for (let i = 0; i < codigos.length; i += 500) {
        const lote = codigos.slice(i, i + 500)
        const { data } = await db.from('Produtos_Completos').select('Codigo_Produto,Descricao_Produto').in('Codigo_Produto', lote)
        ;(data || []).forEach((p: any) => { descMap[String(p.Codigo_Produto)] = p.Descricao_Produto })
      }
      filtrados.sort((a: any, b: any) => (Number(b.valor_estoque) || 0) - (Number(a.valor_estoque) || 0))
      return NextResponse.json({
        item, conta,
        descricao: item === 'pecas'
          ? 'Estoque de pecas: produtos com familia "Pecas" ou sem familia. Vem da tabela "produtos" populada pelo Visual Estoque (CMC x quantidade em estoque).'
          : 'Estoque de maquinas: produtos com familia diferente de "Pecas" (Trator, Implemento, Carreta, Pulverizador etc).',
        formula: 'SUM(valor_estoque = cmc * estoque) na tabela "produtos"',
        total: filtrados.reduce((s: number, p: any) => s + (Number(p.valor_estoque) || 0), 0),
        qtd: filtrados.length,
        itens: filtrados.slice(0, limit).map((p: any) => ({
          rotulo: descMap[String(p.codigo_produto)] || p.modelo || `Produto #${p.codigo_produto}`,
          subtitulo: `Cod ${p.codigo_produto} · ${Number(p.estoque) || 0} un · CMC ${Number((Number(p.valor_estoque) || 0) / (Number(p.estoque) || 1)).toFixed(2)}`,
          valor: Number(p.valor_estoque) || 0,
        })),
      })
    }

    if (item === 'a_receber' || item === 'a_pagar') {
      const tabela = item === 'a_receber' ? 'contas_receber' : 'contas_pagar'
      const colNome = item === 'a_receber' ? 'nome_cliente' : 'nome_fornecedor'
      const isReceber = item === 'a_receber'
      const statusSettled = isReceber
        ? ['PAGO', 'RECEBIDO', 'LIQUIDADO', 'CANCELADO']
        : ['PAGO', 'LIQUIDADO', 'CANCELADO']

      const data = await selectPaginado(() => {
        let q = db.from(tabela)
          .select(`codigo_lancamento,data_vencimento,data_emissao,valor_documento,valor_pago,status_titulo,${colNome},numero_documento_fiscal,numero_parcela,codigo_cliente_fornecedor,conta_omie`)
        if (contaLabel) q = q.eq('conta_omie', contaLabel)
        return q
      })
      const abertos = data
        .filter((r: any) => !statusSettled.includes(String(r.status_titulo || '').toUpperCase()))
        .map((r: any) => {
          const aberto = Math.max((Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0), 0)
          return { ...r, _aberto: aberto }
        })
        .filter((r: any) => r._aberto > 0)
      const totalBruto = abertos.reduce((s: number, r: any) => s + r._aberto, 0)

      // Carrega clientes p/ identificar intercompany e mapear CNPJ
      const { data: clientes } = await db.from('clientes')
        .select('codigo_cliente_omie,conta_omie,cnpj_norm,razao_social,nome_fantasia,cidade,estado')
      const clienteMap: Record<string, any> = {}
      const interCodigos: Record<string, Set<number>> = { nova: new Set(), castro: new Set() }
      const cnpjsIntercompany = new Set([EMPRESAS_GRUPO_CNPJ.nova, EMPRESAS_GRUPO_CNPJ.castro])
      ;(clientes || []).forEach((c: any) => {
        const slug = String(c.conta_omie || '').toLowerCase()
        clienteMap[`${slug}|${c.codigo_cliente_omie}`] = c
        if (c.cnpj_norm && cnpjsIntercompany.has(c.cnpj_norm) && interCodigos[slug]) {
          interCodigos[slug].add(Number(c.codigo_cliente_omie))
        }
      })

      // Agrega por cliente (CNPJ se conhecido, senao nome normalizado).
      // Para a_receber, segue regra global: ignora intercompany + sem cliente.
      // Para a_pagar, idem (fornecedor pode ser empresa do grupo).
      function normNome(n: any) { return String(n || '').trim().toUpperCase() }
      const hojeISO = new Date().toISOString().slice(0, 10)
      let totalIntercompany = 0, qtdIntercompany = 0
      let totalSemCliente = 0, qtdSemCliente = 0
      const agg = new Map<string, any>()
      abertos.forEach((r: any) => {
        const slug = String(r.conta_omie || '').toLowerCase()
        const codCli = Number(r.codigo_cliente_fornecedor)
        if (codCli && interCodigos[slug] && interCodigos[slug].has(codCli)) { totalIntercompany += r._aberto; qtdIntercompany++; return }
        const c = clienteMap[`${slug}|${r.codigo_cliente_fornecedor}`]
        if (c && c.cnpj_norm && cnpjsIntercompany.has(c.cnpj_norm)) { totalIntercompany += r._aberto; qtdIntercompany++; return }
        const nomeNorm = normNome(r[colNome])
        if (!nomeNorm && !c) { totalSemCliente += r._aberto; qtdSemCliente++; return }
        const chave = c && c.cnpj_norm ? `CNPJ:${c.cnpj_norm}` : `NOME:${nomeNorm}`
        const nome = (c && (c.razao_social || c.nome_fantasia)) || r[colNome] || '(sem nome)'
        if (!agg.has(chave)) agg.set(chave, {
          chave, nome, cnpj: c?.cnpj_norm || null, cidade: c?.cidade || null, estado: c?.estado || null,
          total: 0, qtd: 0, vencido: 0, aVencer: 0, maiorAtraso: 0, titulos: [],
        })
        const a = agg.get(chave)
        a.total += r._aberto
        a.qtd++
        const venc = r.data_vencimento
        const atrasoDias = venc && venc < hojeISO
          ? Math.max(0, Math.floor((+new Date(hojeISO) - +new Date(venc)) / 86400000))
          : 0
        if (atrasoDias > 0) { a.vencido += r._aberto; a.maiorAtraso = Math.max(a.maiorAtraso, atrasoDias) }
        else a.aVencer += r._aberto
        a.titulos.push({
          codigo: r.codigo_lancamento,
          nf: r.numero_documento_fiscal || null,
          parcela: r.numero_parcela || null,
          vencimento: venc || null,
          emissao: r.data_emissao || null,
          status: r.status_titulo || null,
          valor: r._aberto,
          conta: slug,
          atraso_dias: atrasoDias,
        })
      })
      const partes = Array.from(agg.values()).sort((a: any, b: any) => b.total - a.total)
      partes.forEach((p: any) => p.titulos.sort((a: any, b: any) => b.valor - a.valor))
      const totalClientes = partes.reduce((s: number, p: any) => s + p.total, 0)

      const labelEntidade = isReceber ? 'cliente' : 'fornecedor'
      return NextResponse.json({
        item, conta,
        agrupamento: labelEntidade,
        descricao: isReceber
          ? 'A receber em aberto agrupado por cliente. Exclui status PAGO/RECEBIDO/LIQUIDADO/CANCELADO. Tambem exclui titulos contra empresas do grupo (intercompany NOVA/CASTRO) e titulos sem cliente identificado.'
          : 'A pagar em aberto agrupado por fornecedor. Exclui status PAGO/LIQUIDADO/CANCELADO. Tambem exclui titulos intercompany e sem fornecedor identificado.',
        formula: `SUM(valor_documento - valor_pago) WHERE status NOT IN (${statusSettled.map(s => `'${s}'`).join(',')})`,
        total: totalBruto,
        total_externos: totalClientes,
        excluido_intercompany: totalIntercompany,
        excluido_sem_cliente: totalSemCliente,
        qtd: abertos.length,
        qtd_entidades: partes.length,
        qtd_intercompany: qtdIntercompany,
        qtd_sem_cliente: qtdSemCliente,
        entidades: partes,
      })
    }

    if (item === 'balanco') {
      const p = await calcularPatrimonio(conta)
      const cob = await calcularCobertura(conta)
      return NextResponse.json({
        item, conta,
        descricao: 'Balanco visual: relacao entre o que voce tem (ativos) e o que voce deve (passivos). Cobertura = Ativos / Passivos. Saudavel acima de 1.5x.',
        formula: 'Cobertura = (Estoque + Frota + A receber) / (A pagar em aberto)',
        total: p.patrimonio_operacional,
        composicao: [
          { label: 'Ativos totais', valor: p.total_ativos, destaque: true },
          { label: '  Estoque pecas', valor: p.ativos.estoque_pecas, drill: 'pecas' },
          { label: '  Estoque maquinas', valor: p.ativos.estoque_maquinas, drill: 'maquinas' },
          { label: '  Frota', valor: p.ativos.frota, drill: 'frota' },
          { label: '  A receber em aberto', valor: p.ativos.a_receber_aberto, drill: 'a_receber' },
          { label: 'Passivos totais', valor: -p.total_passivos, destaque: true },
          { label: '  A pagar em aberto', valor: -p.total_passivos, drill: 'a_pagar' },
        ],
        cobertura_atual: p.total_passivos > 0 ? +(p.total_ativos / p.total_passivos).toFixed(2) : null,
        cobertura_por_janela: cob ? cob.janelas : [],
      })
    }

    if (item === 'patrimonio') {
      const p = await calcularPatrimonio(conta)
      return NextResponse.json({
        item, conta,
        descricao: 'Patrimonio operacional = Total de ativos − Total de passivos. NAO inclui saldo bancario (que nao estah persistido no sistema). E um indicador do valor operacional liquido: o que voce tem em estoque + frota + a receber, menos o que precisa pagar.',
        formula: '(Estoque pecas + Estoque maquinas + Frota + A receber em aberto) − A pagar em aberto',
        total: p.patrimonio_operacional,
        composicao: [
          { label: '+ Estoque pecas', valor: p.ativos.estoque_pecas, drill: 'pecas' },
          { label: '+ Estoque maquinas', valor: p.ativos.estoque_maquinas, drill: 'maquinas' },
          { label: '+ Frota', valor: p.ativos.frota, drill: 'frota' },
          { label: '+ A receber em aberto', valor: p.ativos.a_receber_aberto, drill: 'a_receber' },
          { label: '= Ativos totais', valor: p.total_ativos, destaque: true },
          { label: '− A pagar em aberto', valor: -p.total_passivos, drill: 'a_pagar' },
          { label: '= Patrimonio operacional', valor: p.patrimonio_operacional, destaque: true },
        ],
      })
    }

    return NextResponse.json({ erro: 'item invalido. Use: pecas | maquinas | frota | a_receber | a_pagar | patrimonio' }, { status: 400 })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
