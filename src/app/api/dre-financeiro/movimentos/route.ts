// =============================================================================
// API: movimentos - lista Movimentações de Conta Corrente (tabela movimentos_cc,
// alimentada pelo sync /api/dre-financeiro/movimentos/sync a partir do Omie
// /financas/mf/ ListarMovimentos).
// Filtros: conta (nova|castro|todas), de/ate (ISO, por data_pagamento),
// natureza (P|R), cc (codigo da conta corrente).
// Retorna { movimentos, totais, contasCorrentes } — totais por valor_pago.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
// @ts-ignore - modulo CommonJS sem tipos
import { labelConta } from '@/lib/dre-financeiro/omie-api'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
import { fmtISO, inicioMes, fimMes } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

const COLS = [
  'id', 'conta_omie', 'codigo_movimento', 'codigo_titulo', 'natureza', 'origem',
  'status', 'numero_documento', 'numero_documento_fiscal', 'numero_parcela',
  'data_pagamento', 'data_vencimento', 'valor_documento', 'valor_pago',
  'valor_liquido', 'juros', 'multa', 'desconto', 'liquidado',
  'codigo_conta_corrente', 'nome_conta_corrente',
  'descricao_categoria', 'grupo_categoria', 'nome_cliente_fornecedor',
].join(',')

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const now = new Date()
    const ini = sp.get('de') || fmtISO(inicioMes(now.getFullYear(), now.getMonth() + 1))
    const fim = sp.get('ate') || fmtISO(fimMes(now.getFullYear(), now.getMonth() + 1))
    const natureza = (sp.get('natureza') || '').toUpperCase()
    const cc = sp.get('cc') || ''

    // PostgREST corta toda consulta em 1000 linhas — pagina com .range até esgotar.
    const PAGE = 1000
    const LIMITE = 50000
    const rows: any[] = []
    for (let off = 0; off < LIMITE; off += PAGE) {
      let q = supabase.from('movimentos_cc')
        .select(COLS)
        .gte('data_pagamento', ini)
        .lte('data_pagamento', fim)
        .order('data_pagamento', { ascending: false })
        .order('id', { ascending: false })
        .range(off, off + PAGE - 1)
      if (conta !== 'todas') q = q.eq('conta_omie', labelConta(conta))
      if (natureza === 'P' || natureza === 'R') q = q.eq('natureza', natureza)
      if (cc) q = q.eq('codigo_conta_corrente', cc)
      const { data, error } = await q
      if (error) {
        // Tabela ainda nao criada (migration sql/movimentos-cc.sql pendente):
        // devolve resposta amigavel em vez de 500, para a tela orientar o usuario.
        const msg = String(error.message || '')
        if (error.code === '42P01' || (msg.includes('movimentos_cc') && /schema cache|does not exist/i.test(msg))) {
          return NextResponse.json({
            precisaMigration: true, conta, de: ini, ate: fim,
            movimentos: [], contasCorrentes: [],
            totais: { entradas: 0, saidas: 0, saldo: 0, qtd: 0 },
          })
        }
        throw new Error(msg)
      }
      rows.push(...(data || []))
      if (!data || data.length < PAGE) break
    }

    let entradas = 0
    let saidas = 0
    rows.forEach((r) => {
      const v = Number(r.valor_pago) || 0
      if (r.natureza === 'R') entradas += v
      else saidas += v
    })

    // Contas correntes presentes no resultado (para o dropdown de filtro).
    const ccMap = new Map<number, string>()
    rows.forEach((r) => {
      if (r.codigo_conta_corrente && !ccMap.has(r.codigo_conta_corrente)) {
        ccMap.set(r.codigo_conta_corrente, r.nome_conta_corrente || String(r.codigo_conta_corrente))
      }
    })
    const contasCorrentes = Array.from(ccMap, ([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))

    return NextResponse.json({
      conta, de: ini, ate: fim,
      movimentos: rows,
      contasCorrentes,
      totais: { entradas, saidas, saldo: entradas - saidas, qtd: rows.length },
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
