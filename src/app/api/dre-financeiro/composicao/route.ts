// =============================================================================
// API: composicao por grupo / categoria / terceiro (alimenta o treemap)
// Port FIEL de GET /api/composicao do server.js (linhas 1154-1238).
// Agrega titulos do periodo (mes+ano, ou de+ate) por tipo|grupo -> categoria
// -> terceiro e devolve: total, grupos, folhas (1 leaf por categoria) e a
// arvore indexada por "tipo|grupo" para drill-down de terceiros.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, TIPO_PADRAO, TIPOS_VALIDOS,
  tabelaPorTipo, colunaNomePorTipo, aplicarConta,
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

// ---------------------------------------------------------------------------
// Busca paginada dos titulos do periodo.
//
// POR QUE PAGINAR: o PostgREST/Supabase corta TODA resposta em 1000 linhas
// (db-max-rows), silenciosamente e sem erro — o `.limit(50000)` que estava aqui
// NAO adiantava nada. Ate' funcionava por acaso na visao mensal (um mes tem
// ~500-700 titulos), mas qualquer periodo anual truncava feio: 2026 sozinho tem
// 4.881 contas a pagar (so' vinham 1.000 -> total ~80% menor) e 3 anos, 24.204.
// Com o seletor de intervalo/periodos salvos isso viraria numero errado calado.
//
// COMO: conta exato via HEAD, depois dispara ceil(total/1000) requests de 1000
// em paralelo, ordenados por `id` (chave estavel — sem .order() as paginas
// podem repetir/perder linhas na fronteira; ver o padrao de selectPaginado).
const PAG = 1000

async function contarTitulos(sb: any, tabela: string, conta: string, ini: string, fim: string): Promise<number> {
  let q = sb.from(tabela)
    .select('id', { count: 'exact', head: true })
    .gte('data_vencimento', ini)
    .lte('data_vencimento', fim)
  q = aplicarConta(q, conta)
  const { count, error } = await q
  if (error) throw new Error(error.message)
  return count || 0
}

async function buscarTitulos(sb: any, tabela: string, colNome: string, conta: string, ini: string, fim: string): Promise<any[]> {
  const total = await contarTitulos(sb, tabela, conta, ini, fim)
  const paginas = Math.ceil(total / PAG)
  const reqs: Promise<any>[] = []
  for (let p = 0; p < paginas; p++) {
    const from = p * PAG
    let q = sb.from(tabela)
      .select(`grupo_categoria,descricao_categoria,codigo_categoria,${colNome},valor_documento`)
      .gte('data_vencimento', ini)
      .lte('data_vencimento', fim)
      .order('id')
      .range(from, from + PAG - 1)
    q = aplicarConta(q, conta)
    reqs.push(q)
  }
  const lotes = await Promise.all(reqs)
  const linhas: any[] = []
  for (const { data, error } of lotes) {
    if (error) throw new Error(error.message)
    if (data) linhas.push(...data)
  }
  return linhas
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

    const SEM_GRUPO = 'Sem grupo'
    const SEM_CAT = 'Sem categoria'
    const SEM_TERC = 'Sem nome'

    // Estrutura indexada por chave composta tipo|grupo para evitar colisao
    // entre grupos de pagar e receber (no modo "ambos" ambos podem coexistir).
    const acc: Record<string, any> = {}
    function chave(t: string, g: string) { return t + '|' + g }

    for (const t of tipos) {
      const tabela = tabelaPorTipo(t)
      const colNome = colunaNomePorTipo(t)
      const data = await buscarTitulos(supabase, tabela, colNome, conta, ini, fim)

      data.forEach((r: any) => {
        const valor = Number(r.valor_documento) || 0
        if (valor <= 0) return
        const grupo = r.grupo_categoria || SEM_GRUPO
        const categoria = r.descricao_categoria || (r.codigo_categoria || SEM_CAT)
        const terceiro = r[colNome] || SEM_TERC
        const k = chave(t, grupo)
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

    // Achata para folhas (cada categoria = 1 leaf no treemap)
    const folhas: any[] = []
    Object.entries(acc).forEach(([, gObj]: [string, any]) => {
      Object.entries(gObj.categorias).forEach(([categoria, cObj]: [string, any]) => {
        folhas.push({
          tipo: gObj.tipo,
          grupo: gObj.grupo,
          categoria,
          valor: cObj.valor,
        })
      })
    })
    folhas.sort((a, b) => b.valor - a.valor)

    // Resumo por grupo (com tipo)
    const grupos = Object.values(acc)
      .map((g: any) => ({ nome: g.grupo, tipo: g.tipo, valor: g.valor }))
      .sort((a, b) => b.valor - a.valor)

    const total = grupos.reduce((s, g) => s + g.valor, 0)

    return NextResponse.json({
      conta, tipo, mes, ano,
      de: ini, ate: fim,
      total,
      grupos,
      folhas,
      // arvore indexada por "tipo|grupo" para drill-down de terceiros
      arvore: acc,
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
