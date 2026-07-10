// =============================================================================
// API: margens/rateio - insumos mensais para a margem liquida DRE da tela
// Margens: despesas operacionais do mes (contas_pagar por data_emissao, mesma
// classificacao do DRE competencia) + faturamento de servicos (os_mensal, com
// nota + interno). O front rateia as despesas de cada mes entre as vendas
// proporcionalmente a receita, usando como denominador a receita TOTAL vendida
// (maquinas + pecas) + servicos faturados — as despesas sustentam a operacao
// inteira, entao o rateio nao pode cair so sobre o recorte filtrado na tela.
//
// GET ?conta=nova|castro|todas&desde=YYYY-MM&ate=YYYY-MM
// -> { conta, desde, ate, porMes: { 'YYYY-MM': { despesas, servicos } } }
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// Grupos do contas_pagar que entram como "2. Despesas" no DRE (espelho de
// classificaGrupoCP do calc.js — 'Despesas Diretas' fica fora: sao compras,
// ja contadas no CMV; 'Devolucoes de Vendas' e redutor de receita).
const GRUPOS_DESPESA = new Set([
  'Despesas com Pessoal',
  'Despesas Administrativas',
  'Despesas Financeiras / Bancos',
  'Despesas de Vendas e Marketing',
  'Outras Despesas',
  'Impostos e Taxas',
])

// pegaConta reimplementado inline: le searchParams 'conta', senao cookie,
// senao default. Valores: nova|castro|todas.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const sp = request.nextUrl.searchParams
    const desde = sp.get('desde') || ''
    const ate = sp.get('ate') || ''
    if (!/^\d{4}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}$/.test(ate)) {
      return NextResponse.json({ erro: 'desde/ate devem ser YYYY-MM' }, { status: 400 })
    }
    const dataDe = desde + '-01'
    const [anoAte, mesAte] = ate.split('-').map(Number)
    const dataAte = ate + '-' + String(new Date(anoAte, mesAte, 0).getDate()).padStart(2, '0')

    const porMes: Record<string, { despesas: number; servicos: number }> = {}
    const mes = (k: string) => {
      if (!porMes[k]) porMes[k] = { despesas: 0, servicos: 0 }
      return porMes[k]
    }

    // --- Despesas: contas_pagar por data_emissao, paginado (PostgREST corta em
    // 1000 linhas; ORDER estavel obrigatorio para as paginas nao repetirem).
    let from = 0
    for (;;) {
      const { data, error } = await supabase.from('contas_pagar')
        .select('valor_documento,data_emissao,conta_omie,grupo_categoria,status_titulo')
        .gte('data_emissao', dataDe).lte('data_emissao', dataAte)
        .not('grupo_categoria', 'is', null)
        .order('codigo_lancamento', { ascending: true })
        .order('conta_omie', { ascending: true })
        .range(from, from + 999)
      if (error) throw new Error(error.message)
      const rows = data || []
      rows.forEach((r: any) => {
        // Titulos cancelados continuam na tabela (sync e upsert) - fora do DRE.
        if (String(r.status_titulo || '').toUpperCase().includes('CANCEL')) return
        const slug = String(r.conta_omie || '').toLowerCase()
        if (slug !== 'nova' && slug !== 'castro') return
        if (conta !== 'todas' && slug !== conta) return
        if (!GRUPOS_DESPESA.has(String(r.grupo_categoria))) return
        if (!r.data_emissao) return
        mes(String(r.data_emissao).slice(0, 7)).despesas += Math.abs(Number(r.valor_documento) || 0)
      })
      if (rows.length < 1000) break
      from += 1000
    }

    // --- Servicos: os_mensal (valor_total = faturado com nota + interno).
    // conta_omie desta tabela e MAIUSCULA ('NOVA'/'CASTRO').
    let qos = supabase.from('os_mensal').select('mes,ano,valor_total,conta_omie')
    if (conta !== 'todas') qos = qos.eq('conta_omie', conta.toUpperCase())
    const { data: osRows, error: osErr } = await qos
    if (osErr) throw new Error(osErr.message)
    ;(osRows || []).forEach((r: any) => {
      const k = r.ano + '-' + String(r.mes).padStart(2, '0')
      if (k < desde || k > ate) return
      mes(k).servicos += Number(r.valor_total) || 0
    })

    return NextResponse.json({ conta, desde, ate, porMes })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
