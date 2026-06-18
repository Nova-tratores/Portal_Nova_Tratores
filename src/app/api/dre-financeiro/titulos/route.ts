// =============================================================================
// API: titulos de um periodo (lista) - port FIEL de GET /api/titulos do server.js
// Recebe `data` (um dia) OU `de`+`ate` (intervalo) e devolve os titulos do
// periodo, ja filtrados por conta/tipo/status e com os vencidos antigos ocultos.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, TIPO_PADRAO, TIPOS_VALIDOS,
  tabelaPorTipo, colunaNomePorTipo,
  aplicarConta, aplicarFiltrosExtras, filtraPorStatus, escondeVencidoAntigo,
} from '@/lib/dre-financeiro/calc'
import { hoje, statusDerivado } from '@/lib/dre-financeiro/dates'

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

// Monta o objeto de query (espelha req.query) consumido por aplicarFiltrosExtras
// e filtraPorStatus.
function queryObj(request: NextRequest): Record<string, string> {
  const q: Record<string, string> = {}
  request.nextUrl.searchParams.forEach((v, k) => { q[k] = v })
  return q
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const sp = request.nextUrl.searchParams
    const data = sp.get('data')
    const de = sp.get('de')
    const ate = sp.get('ate')

    if (!data && !(de && ate)) {
      return NextResponse.json({ erro: 'informe data ou de+ate' }, { status: 400 })
    }

    const q = queryObj(request)
    const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]

    const todasRows: any[] = []
    for (const t of tipos) {
      const tabela = tabelaPorTipo(t)
      const colNome = colunaNomePorTipo(t)
      let query = supabase.from(tabela)
        .select('*')
        .order('valor_documento', { ascending: false })
        .limit(1000)
      if (data) query = query.eq('data_vencimento', data)
      else query = query.gte('data_vencimento', de).lte('data_vencimento', ate)
      query = aplicarConta(query, conta)
      query = aplicarFiltrosExtras(query, q)
      const { data: rows, error } = await query
      if (error) throw new Error(error.message)
      ;(rows || []).forEach((r: any) => todasRows.push({ ...r, _tipo: t, _nome: r[colNome] || null }))
    }

    const ref = hoje()
    const out = filtraPorStatus(escondeVencidoAntigo(todasRows, ref), q.status).map((r: any) => ({
      tipo: r._tipo,
      codigo_lancamento: r.codigo_lancamento,
      conta_omie: r.conta_omie,
      numero_documento: r.numero_documento,
      numero_documento_fiscal: r.numero_documento_fiscal,
      numero_boleto: r.numero_boleto,
      numero_parcela: r.numero_parcela,
      observacao: r.observacao,
      data_emissao: r.data_emissao,
      data_vencimento: r.data_vencimento,
      data_pagamento: r.data_pagamento,
      valor_documento: Number(r.valor_documento) || 0,
      valor_pago: Number(r.valor_pago) || 0,
      valor_imp_retido: Number(r.valor_imp_retido) || 0,
      status_titulo: r.status_titulo,
      status_derivado: statusDerivado(r, ref),
      descricao_categoria: r.descricao_categoria,
      grupo_categoria: r.grupo_categoria,
      descricao_departamento: r.descricao_departamento,
      nome_contraparte: r._nome,
    }))
    // Ordena por valor desc
    out.sort((a: any, b: any) => b.valor_documento - a.valor_documento)
    return NextResponse.json({ titulos: out, total: out.length })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
