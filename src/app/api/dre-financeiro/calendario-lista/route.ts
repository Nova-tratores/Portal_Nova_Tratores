import { NextRequest, NextResponse } from 'next/server'
import {
  CONTA_PADRAO,
  TIPO_PADRAO,
  TIPOS_VALIDOS,
  tabelaPorTipo,
  colunaNomePorTipo,
  aplicarConta,
  aplicarFiltrosExtras,
  filtraPorStatus,
  escondeVencidoAntigo,
} from '@/lib/dre-financeiro/calc'
import { hoje, statusDerivado } from '@/lib/dre-financeiro/dates'
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
  for (const k of ['status', 'fornecedor', 'categoria', 'departamento', 'grupo']) {
    const v = sp.get(k)
    if (v != null) q[k] = v
  }
  return q
}

// =============================================================================
// API: lista de titulos por intervalo (de+ate) - alimenta a visao em lista
// =============================================================================
export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const q = montaQuery(request)
    const eixo = request.nextUrl.searchParams.get('eixo') === 'emissao' ? 'emissao' : 'vencimento'
    const campoData = eixo === 'emissao' ? 'data_emissao' : 'data_vencimento'
    const de = request.nextUrl.searchParams.get('de')
    const ate = request.nextUrl.searchParams.get('ate')
    if (!de || !ate) return NextResponse.json({ erro: 'informe de+ate' }, { status: 400 })

    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]
    const COLS = 'codigo_lancamento,conta_omie,numero_documento,numero_documento_fiscal,' +
                 'numero_parcela,data_emissao,data_vencimento,data_pagamento,valor_documento,' +
                 'valor_pago,status_titulo,grupo_categoria,descricao_categoria,descricao_departamento'
    const ref = hoje()

    const todas: any[] = []
    for (const t of tipos) {
      const tabela = tabelaPorTipo(t)
      const colNome = colunaNomePorTipo(t)
      const PAGINA = 1000
      let off = 0
      for (;;) {
        let query = supabase.from(tabela)
          .select(`${COLS},${colNome}`)
          .gte(campoData, de)
          .lte(campoData, ate)
          .order('codigo_lancamento', { ascending: true })
          .range(off, off + PAGINA - 1)
        query = aplicarConta(query, conta)
        query = aplicarFiltrosExtras(query, q)
        const { data, error } = await query
        if (error) throw new Error(error.message)
        const lote = data || []
        lote.forEach((r: any) => todas.push({ ...r, _tipo: t, _nome: r[colNome] || null }))
        if (lote.length < PAGINA) break
        off += PAGINA
      }
    }

    // No eixo emissao a janela ja e por emissao; escondeVencidoAntigo (por
    // data_vencimento) so se aplica ao eixo vencimento.
    const semLixo = eixo === 'emissao' ? todas : escondeVencidoAntigo(todas, ref)
    const filtradas = filtraPorStatus(semLixo, q.status)
    const titulos = filtradas.map((r: any) => ({
      tipo: r._tipo,
      codigo_lancamento: r.codigo_lancamento,
      conta_omie: r.conta_omie,
      nome_contraparte: r._nome,
      numero_documento: r.numero_documento,
      numero_documento_fiscal: r.numero_documento_fiscal,
      numero_parcela: r.numero_parcela,
      data_emissao: r.data_emissao,
      data_vencimento: r.data_vencimento,
      data_pagamento: r.data_pagamento,
      valor_documento: Number(r.valor_documento) || 0,
      valor_pago: Number(r.valor_pago) || 0,
      status_titulo: r.status_titulo,
      status_derivado: statusDerivado(r, ref),
      grupo_categoria: r.grupo_categoria,
      descricao_categoria: r.descricao_categoria,
      descricao_departamento: r.descricao_departamento
    }))
    return NextResponse.json({ titulos, total: titulos.length })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
