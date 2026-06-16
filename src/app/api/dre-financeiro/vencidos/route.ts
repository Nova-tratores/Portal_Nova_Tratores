import { NextRequest, NextResponse } from 'next/server'
import {
  CONTA_PADRAO,
  TIPO_PADRAO,
  TIPOS_VALIDOS,
  VENCIDOS_IGNORADOS,
  tabelaPorTipo,
  colunaNomePorTipo,
  aplicarConta,
  aplicarFiltrosExtras,
} from '@/lib/dre-financeiro/calc'
import { hoje } from '@/lib/dre-financeiro/dates'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

// pegaConta/pegaTipo reimplementados inline (le searchParams, senao cookie, senao padrao)
function pegaConta(request: NextRequest): string {
  const c = (
    request.nextUrl.searchParams.get('conta') ||
    request.cookies.get('conta')?.value ||
    CONTA_PADRAO
  ).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

function pegaTipo(request: NextRequest): string {
  const t = (
    request.nextUrl.searchParams.get('tipo') ||
    request.cookies.get('tipo')?.value ||
    TIPO_PADRAO
  ).toString().toLowerCase()
  return TIPOS_VALIDOS.has(t) ? t : 'pagar'
}

// Espelha req.query do Express: objeto plano com os filtros que calc.js le.
function montaQuery(request: NextRequest): Record<string, string> {
  const sp = request.nextUrl.searchParams
  const q: Record<string, string> = {}
  for (const k of ['fornecedor', 'categoria', 'departamento', 'grupo']) {
    const v = sp.get(k)
    if (v != null) q[k] = v
  }
  return q
}

// =============================================================================
// API: titulos vencidos (inadimplencia) - aging buckets + ranking por terceiro
// =============================================================================
export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  // Captura local nao-null: o narrowing acima nao alcanca closures aninhadas (fetchVencidos).
  const db = supabase
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const q = montaQuery(request)
    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]
    const ref = hoje()

    const COLS = 'codigo_lancamento,conta_omie,numero_documento,numero_documento_fiscal,' +
                 'numero_parcela,data_emissao,data_vencimento,data_pagamento,valor_documento,' +
                 'valor_pago,status_titulo,grupo_categoria,descricao_categoria,codigo_cliente_fornecedor'

    // Esconde "vencidos antigos": titulos cujo vencimento e anterior ao ano
    // corrente (ex.: em 2026, oculta tudo que venceu em 2025 ou antes). Mesmo
    // criterio do /calendario (escondeVencidoAntigo), aplicado aqui no banco.
    const cutoffAntigo = `${new Date().getFullYear()}-01-01`

    async function fetchVencidos(t: string) {
      const tabela = tabelaPorTipo(t)
      const colNome = colunaNomePorTipo(t)
      const PAGINA = 1000
      let de = 0
      const todos: any[] = []
      for (;;) {
        let query = db.from(tabela)
          .select(`${COLS},${colNome}`)
          .eq('status_titulo', 'ATRASADO')
          .gte('data_vencimento', cutoffAntigo)
          .order('data_vencimento', { ascending: true })
          .range(de, de + PAGINA - 1)
        query = aplicarConta(query, conta)
        query = aplicarFiltrosExtras(query, q)
        const { data, error } = await query
        if (error) throw new Error(error.message)
        const lote = data || []
        todos.push(...lote)
        if (lote.length < PAGINA) break
        de += PAGINA
      }
      return todos.map((r: any) => ({ ...r, _tipo: t, _nome: r[colNome] || null }))
    }

    const rows: any[] = []
    for (const t of tipos) rows.push(...await fetchVencidos(t))

    function diasAtraso(vencISO: any) {
      const p = String(vencISO).slice(0, 10).split('-')
      const v = new Date(+p[0], +p[1] - 1, +p[2]) // meia-noite local, igual a hoje()
      return Math.round((ref.getTime() - v.getTime()) / 86400000)
    }
    function bucketDe(d: number) {
      if (d <= 30) return '1-30'
      if (d <= 60) return '31-60'
      if (d <= 90) return '61-90'
      return '90+'
    }

    // Exclui contrapartes intercompany (NOVA <-> CASTRO): nao sao inadimplencia real.
    function ehIntercompany(nome: any) {
      const n = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      return n.includes('castro pecas') || n.includes('nova tratores')
    }

    const titulos: any[] = []
    for (const r of rows) {
      if (!r.data_vencimento) continue
      if (VENCIDOS_IGNORADOS.has(Number(r.codigo_lancamento))) continue
      if (ehIntercompany(r._nome)) continue
      const valorDoc = Number(r.valor_documento) || 0
      const valorPago = Number(r.valor_pago) || 0
      let aberto = valorDoc - valorPago
      if (aberto <= 0.01) aberto = valorDoc // valor_pago nao populado: usa o documento
      const dias = Math.max(1, diasAtraso(r.data_vencimento))
      titulos.push({
        tipo: r._tipo,
        codigo_lancamento: r.codigo_lancamento,
        conta_omie: r.conta_omie,
        nome: r._nome,
        codigo_contraparte: r.codigo_cliente_fornecedor,
        numero_documento: r.numero_documento,
        numero_documento_fiscal: r.numero_documento_fiscal,
        numero_parcela: r.numero_parcela,
        grupo_categoria: r.grupo_categoria,
        descricao_categoria: r.descricao_categoria,
        data_emissao: r.data_emissao,
        data_vencimento: r.data_vencimento,
        valor_documento: valorDoc,
        valor_pago: valorPago,
        valor_aberto: aberto,
        parcial: valorPago > 0.01,
        dias_atraso: dias,
        faixa: bucketDe(dias)
      })
    }

    titulos.sort((a, b) => b.dias_atraso - a.dias_atraso || b.valor_aberto - a.valor_aberto)

    // Faixas de atraso (aging buckets)
    const FAIXAS = ['1-30', '31-60', '61-90', '90+']
    const faixas: Record<string, any> = {}
    FAIXAS.forEach(f => { faixas[f] = { faixa: f, total: 0, count: 0, totalPagar: 0, totalReceber: 0 } })
    let totalGeral = 0, totalPagar = 0, totalReceber = 0
    titulos.forEach(t => {
      const f = faixas[t.faixa]
      f.total += t.valor_aberto; f.count += 1
      if (t.tipo === 'pagar') { f.totalPagar += t.valor_aberto; totalPagar += t.valor_aberto }
      else { f.totalReceber += t.valor_aberto; totalReceber += t.valor_aberto }
      totalGeral += t.valor_aberto
    })

    // Agrupado por terceiro (ranking)
    const mapaT: Record<string, any> = {}
    titulos.forEach(t => {
      const chave = t.tipo + '|' + (t.codigo_contraparte || ('nome:' + (t.nome || 'sem')))
      if (!mapaT[chave]) {
        mapaT[chave] = { chave, tipo: t.tipo, nome: t.nome || 'Sem nome',
                         total: 0, count: 0, maxAtraso: 0 }
      }
      const g = mapaT[chave]
      g.total += t.valor_aberto; g.count += 1
      if (t.dias_atraso > g.maxAtraso) g.maxAtraso = t.dias_atraso
    })
    const porTerceiro = Object.values(mapaT).sort((a: any, b: any) => b.total - a.total)

    return NextResponse.json({
      conta, tipo,
      kpis: {
        total: totalGeral, count: titulos.length, totalPagar, totalReceber,
        maiorAtraso: titulos.length ? titulos[0].dias_atraso : 0
      },
      faixas: FAIXAS.map(f => faixas[f]),
      titulos,
      porTerceiro
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
