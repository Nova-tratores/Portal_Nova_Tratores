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
      let q = supabase.from(tabela)
        .select(`grupo_categoria,descricao_categoria,codigo_categoria,${colNome},valor_documento`)
        .gte('data_vencimento', ini)
        .lte('data_vencimento', fim)
        .limit(50000)
      q = aplicarConta(q, conta)
      const { data, error } = await q
      if (error) throw new Error(error.message)

      ;(data || []).forEach((r: any) => {
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
