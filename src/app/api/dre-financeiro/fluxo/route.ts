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
          .select(`grupo_categoria,descricao_categoria,codigo_categoria,${colNome},valor_documento`)
          .gte('data_vencimento', ini)
          .lte('data_vencimento', fim)
          .order('id')
        return aplicarConta(q, conta)
      })

      ;(data || []).forEach((r: any) => {
        const valor = Number(r.valor_documento) || 0
        if (valor <= 0) return
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
