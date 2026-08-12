// =============================================================================
// API: fluxo (alimenta o Sankey - grupo -> categoria -> top terceiros).
// Port FIEL de GET /api/fluxo do server.js (linhas 1313-1452).
// Agrega titulos do periodo (mes+ano, ou de+ate) por tipo|grupo -> categoria
// -> terceiro e monta nodes/links com top-N por nivel e nos "Outros".
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, TIPO_PADRAO, TIPOS_VALIDOS,
  tabelaPorTipo, colunaNomePorTipo, aplicarConta, selectPaginado,
} from '@/lib/dre-financeiro/calc'
import { fmtISO, inicioMes, fimMes } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

// pegaConta / pegaTipo reimplementados inline (server.js:68-77): le searchParams
// 'conta'/'tipo', senao cookie, senao default. Valores: nova|castro|todas e
// pagar|receber|ambos.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

function pegaTipo(request: NextRequest): string {
  const t = (request.nextUrl.searchParams.get('tipo')
    || request.cookies.get('tipo')?.value
    || TIPO_PADRAO).toString().toLowerCase()
  return (TIPOS_VALIDOS as Set<string>).has(t) ? t : 'pagar'
}

// Antecipacao de duplicatas (desconto APIP): o titulo a pagar carrega o valor de
// FACE cheio do recebivel (100% principal, zero juro de factoring) e cai em
// "Despesas Financeiras / Bancos", inflando o grupo como se fosse despesa quando
// e' movimentacao de FINANCIAMENTO. No /fluxo (visao de CAIXA) o usuario decidiu
// REMOVER o principal por completo do diagrama — nem barra propria, nem somado nos
// KPIs de Saidas/Saldo — deixando so' o JURO real (de movimentos_cc) como despesa.
// (Diferente da DRE, que MANTEM o principal num no' fora do resultado; aqui some.)
// Discriminador espelha calc.js (ehDescontoDuplicataAPIP, linhas 1471-1474); mantido
// INLINE aqui pra correcao autocontida — os helpers de calc.js ainda nao estao na main.
const CAT_JURO_ANTECIP = 'Juros de antecipação de duplicatas'
function ehDescontoDuplicataAPIP(r: any): boolean {
  return String(r?.codigo_categoria || '') === '2.05.03' && String(r?.id_origem || '') === 'APIP'
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const mes = parseInt(sp.get('mes') || '', 10) || (new Date().getMonth() + 1)
    const ano = parseInt(sp.get('ano') || '', 10) || new Date().getFullYear()
    // Opcional: de e ate (ISO YYYY-MM-DD). Quando informados, sobrepoem mes+ano.
    const ini = sp.get('de') ? String(sp.get('de')) : fmtISO(inicioMes(ano, mes))
    const fim = sp.get('ate') ? String(sp.get('ate')) : fmtISO(fimMes(ano, mes))
    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]

    const TOP_GRUPOS = parseInt(sp.get('topGrupos') || '', 10) || 8
    const TOP_CATS = parseInt(sp.get('topCats') || '', 10) || 4
    const TOP_TERC = parseInt(sp.get('topTerc') || '', 10) || 4

    const SEM_GRUPO = 'Sem grupo'
    const SEM_CAT = 'Sem categoria'
    const SEM_TERC = 'Sem nome'

    // Agrega: grupos[tipo|grupo] -> { tipo, grupo, valor, categorias{ valor, terceiros{} } }
    const acc: Record<string, any> = {}
    for (const t of tipos) {
      const tabela = tabelaPorTipo(t)
      const colNome = colunaNomePorTipo(t)
      // PAGINAR: o PostgREST corta TODA resposta em 1000 linhas (db-max-rows), o
      // .limit(50000) que estava aqui NAO adiantava -> qualquer periodo anual
      // (4.000+ titulos) truncava e o Sankey vinha ~80% menor. selectPaginado
      // usa .order('id') (chave estavel obrigatoria: sem ela range() repete/perde
      // linhas na fronteira das paginas).
      const data = await selectPaginado(() => {
        const q = supabase!.from(tabela)
          .select(`grupo_categoria,descricao_categoria,codigo_categoria,${colNome},valor_documento,id_origem:raw->>id_origem`)
          .gte('data_vencimento', ini)
          .lte('data_vencimento', fim)
          .order('id')
        return aplicarConta(q, conta)
      })

      ;(data || []).forEach((r: any) => {
        const valor = Number(r.valor_documento) || 0
        if (valor <= 0) return
        // Principal do desconto de duplicata (APIP): REMOVIDO do fluxo (e' so'
        // financiamento, nao caixa-despesa). Fica so' o juro real, trazido de
        // movimentos_cc logo abaixo. Sem isso o principal inflava Saidas/Saldo.
        if (t === 'pagar' && ehDescontoDuplicataAPIP(r)) return
        const grupo = r.grupo_categoria || SEM_GRUPO
        const categoria = r.descricao_categoria || (r.codigo_categoria || SEM_CAT)
        const terceiro = r[colNome] || SEM_TERC
        const k = t + '|' + grupo
        if (!acc[k]) acc[k] = { tipo: t, grupo, valor: 0, categorias: {} }
        if (!acc[k].categorias[categoria]) {
          acc[k].categorias[categoria] = { valor: 0, terceiros: {} }
        }
        acc[k].valor += valor
        acc[k].categorias[categoria].valor += valor
        const tCount = acc[k].categorias[categoria].terceiros[terceiro] || 0
        acc[k].categorias[categoria].terceiros[terceiro] = tCount + valor
      })
    }

    // JURO da antecipacao de duplicatas: o CUSTO real (o principal isolado acima e'
    // so financiamento). Vive em movimentos_cc como lancamento de CC SEM titulo
    // (codigo_titulo=0) na conta "Omie Desconto de Duplicatas" — nunca vira
    // contas_pagar, entao o /fluxo nunca o mostrou. Mesma fonte do bloco 4c da DRE
    // (calc.js:1684-1710) e do sinal "Juros de antecipacao" da Saude (calc.js:338-358).
    // Entra como despesa pequena em "Despesas Financeiras / Bancos" (espelha a DRE,
    // que joga o juro em "03. Despesas Financeiras"). Best-effort: tabela vazia/sync
    // nao rodou -> segue sem o juro. Filtra por data_pagamento (unica data de um
    // lancamento de CC) — leve mistura com o data_vencimento dos titulos, aceitavel
    // num diagrama de fluxo. codigo_titulo=0 garante que nao duplica com contas_pagar.
    if (tipos.includes('pagar')) {
      try {
        const juros = await selectPaginado(() => {
          let q = supabase!.from('movimentos_cc')
            .select('conta_omie,valor_pago,descricao_categoria,nome_conta_corrente,status')
            .eq('natureza', 'P')
            .eq('codigo_titulo', 0)
            .ilike('nome_conta_corrente', '%Desconto de Duplicata%')
            .not('grupo_categoria', 'is', null)
            .gte('data_pagamento', ini)
            .lte('data_pagamento', fim)
            .order('id')
          if (conta !== 'todas') q = q.eq('conta_omie', conta.toUpperCase())
          return q
        })
        ;(juros || []).forEach((r: any) => {
          if (String(r.status || '').toUpperCase().includes('CANCEL')) return
          if (/transfer/i.test(String(r.descricao_categoria || ''))) return // transferencia = liquido, nao juro
          const valor = Number(r.valor_pago) || 0
          if (valor <= 0) return
          const grupo = 'Despesas Financeiras / Bancos'
          const categoria = CAT_JURO_ANTECIP
          const terceiro = r.nome_conta_corrente || 'Antecipação'
          const k = 'pagar|' + grupo
          if (!acc[k]) acc[k] = { tipo: 'pagar', grupo, valor: 0, categorias: {} }
          if (!acc[k].categorias[categoria]) acc[k].categorias[categoria] = { valor: 0, terceiros: {} }
          acc[k].valor += valor
          acc[k].categorias[categoria].valor += valor
          acc[k].categorias[categoria].terceiros[terceiro] = (acc[k].categorias[categoria].terceiros[terceiro] || 0) + valor
        })
      } catch (e: any) {
        console.warn('[fluxo] juros de antecipacao (movimentos_cc):', e?.message)
      }
    }

    // Constroi nodes/links com top-N e "Outros"
    const nodes: any[] = []
    const nodeIds = new Set<string>()
    const links: any[] = []
    function addNode(id: string, name: string, tp: string, nivel: string, valor: number) {
      if (nodeIds.has(id)) return
      nodeIds.add(id)
      nodes.push({ id, name, tipo: tp, nivel, valor })
    }
    function safeKey(s: any) { return String(s).replace(/\|/g, ' ') }

    // Top grupos por valor
    const gruposOrdenados = Object.values(acc).sort((a: any, b: any) => b.valor - a.valor)
    const topGrupos = gruposOrdenados.slice(0, TOP_GRUPOS)

    topGrupos.forEach((g: any) => {
      const idGrupo = `g|${g.tipo}|${safeKey(g.grupo)}`
      addNode(idGrupo, g.grupo, g.tipo, 'grupo', g.valor)

      // Top categorias do grupo
      const cats = Object.entries(g.categorias)
        .map(([nome, c]: [string, any]) => ({ nome, valor: c.valor, terceiros: c.terceiros }))
        .sort((a, b) => b.valor - a.valor)
      const topCats = cats.slice(0, TOP_CATS)
      const restoCats = cats.slice(TOP_CATS)

      topCats.forEach((c) => {
        const idCat = `c|${g.tipo}|${safeKey(g.grupo)}|${safeKey(c.nome)}`
        addNode(idCat, c.nome, g.tipo, 'categoria', c.valor)
        links.push({ source: idGrupo, target: idCat, value: c.valor, tipo: g.tipo })

        // Top terceiros da categoria
        const tercs = Object.entries(c.terceiros)
          .map(([nome, valor]: [string, any]) => ({ nome, valor }))
          .sort((a, b) => b.valor - a.valor)
        const topT = tercs.slice(0, TOP_TERC)
        const restoT = tercs.slice(TOP_TERC)

        topT.forEach((tc) => {
          const idTerc = `t|${g.tipo}|${safeKey(g.grupo)}|${safeKey(c.nome)}|${safeKey(tc.nome)}`
          addNode(idTerc, tc.nome, g.tipo, 'terceiro', tc.valor)
          links.push({ source: idCat, target: idTerc, value: tc.valor, tipo: g.tipo })
        })
        if (restoT.length > 0) {
          const valorOut = restoT.reduce((s, x) => s + x.valor, 0)
          const idOut = `o|${g.tipo}|${safeKey(g.grupo)}|${safeKey(c.nome)}`
          addNode(idOut, `+${restoT.length} outros`, g.tipo, 'terceiro', valorOut)
          links.push({ source: idCat, target: idOut, value: valorOut, tipo: g.tipo })
        }
      })
      if (restoCats.length > 0) {
        const valorOut = restoCats.reduce((s, x) => s + x.valor, 0)
        const idOut = `o|${g.tipo}|${safeKey(g.grupo)}|cats`
        addNode(idOut, `+${restoCats.length} outras categorias`, g.tipo, 'categoria', valorOut)
        links.push({ source: idGrupo, target: idOut, value: valorOut, tipo: g.tipo })
      }
    })

    // Resto dos grupos (acima do TOP)
    const restoGrupos = gruposOrdenados.slice(TOP_GRUPOS)
    if (restoGrupos.length > 0) {
      // Agrupa por tipo
      ;['pagar', 'receber'].forEach((t) => {
        const gs = restoGrupos.filter((g: any) => g.tipo === t)
        if (gs.length === 0) return
        const valorOut = gs.reduce((s: number, g: any) => s + g.valor, 0)
        // Sem nivel "grupo" anterior, criamos um pseudo-grupo direto
        const idOut = `g|${t}|+outros`
        addNode(idOut, `+${gs.length} outros grupos`, t, 'grupo', valorOut)
      })
    }

    const totalSaidas = gruposOrdenados.filter((g: any) => g.tipo === 'pagar').reduce((s: number, g: any) => s + g.valor, 0)
    const totalEntradas = gruposOrdenados.filter((g: any) => g.tipo === 'receber').reduce((s: number, g: any) => s + g.valor, 0)

    return NextResponse.json({
      conta, tipo, mes, ano,
      total: totalSaidas + totalEntradas,
      totalEntradas,
      totalSaidas,
      nodes,
      links
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
