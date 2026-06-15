// =============================================================================
// API: patrimonio/backfill - port FIEL de POST /api/patrimonio/backfill do
// server.js (linhas 2056-2161). Gera snapshots para datas passadas.
// IMPORTANTE: estoque/frota nao temos historico, usamos o valor ATUAL como
// aproximacao. A_receber e a_pagar abertos em data X sao calculados com:
//   aberto_em_X = SUM(valor_documento - valor_pago) WHERE
//                 data_emissao <= X AND (data_pagamento IS NULL OR data_pagamento > X)
// Isso e uma aproximacao razoavel; ignora baixas parciais antes de X.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { selectPaginado, calcularEstoque, calcularFrota } from '@/lib/dre-financeiro/calc'
import { hoje, fmtISO, addDias } from '@/lib/dre-financeiro/dates'
import { getContasOmie, labelConta } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const db = supabase // referencia non-null para uso dentro de closures
  try {
    const sp = request.nextUrl.searchParams
    const diasAtras = Math.max(1, Math.min(730, parseInt(sp.get('dias') || '', 10) || 90))
    const passo = Math.max(1, parseInt(sp.get('passo') || '', 10) || 1) // dia 1 = todos os dias

    const ref = hoje()
    // Pega todos os titulos pagar/receber (sem filtro de conta — depois separamos)
    async function carregaTodos(tabela: string) {
      return selectPaginado(() => db.from(tabela)
        .select('valor_documento,valor_pago,data_emissao,data_pagamento,data_vencimento,status_titulo,conta_omie'))
    }
    const [pagarTodos, receberTodos] = await Promise.all([
      carregaTodos('contas_pagar'),
      carregaTodos('contas_receber'),
    ])

    const contas = getContasOmie().map((c: any) => c.id).concat(['todas'])
    // Estoque/frota ATUAL (snapshot constante para o historico)
    const estoquePorConta: Record<string, any> = {}
    for (const c of contas) {
      const slug = c === 'todas' ? null : String(c).toLowerCase()
      estoquePorConta[c] = await calcularEstoque(slug)
    }
    const frotaAtual = await calcularFrota()

    const rows: any[] = []
    let snapshotsCriados = 0

    for (let d = 0; d <= diasAtras; d += passo) {
      const dataDate = addDias(ref, -d)
      const dataISO = fmtISO(dataDate)

      for (const c of contas) {
        const isAll = c === 'todas'
        const contaLabelUC = isAll ? null : labelConta(c)
        const estoque = estoquePorConta[c]

        function aberto(rows: any[]) {
          return rows
            .filter((r: any) => isAll || r.conta_omie === contaLabelUC)
            .filter((r: any) => {
              const s = String(r.status_titulo || '').toUpperCase()
              if (s === 'CANCELADO') return false
              // Titulo ja liquidado mas sem data_pagamento na base: assume liquidado
              // (sem isso, RECEBIDO/PAGO/LIQUIDADO com data_pagamento ausente bleed eterno).
              if (['PAGO', 'RECEBIDO', 'LIQUIDADO'].includes(s) && !r.data_pagamento) return false
              const emiss = r.data_emissao
              const pago = r.data_pagamento
              // Estava aberto em dataISO se: emitido <= data E (nao pago ou pago depois)
              if (emiss && emiss > dataISO) return false // ainda nao emitido na data
              if (pago && pago <= dataISO) return false // ja pago na data
              return true
            })
            .reduce((s: number, r: any) => s + Math.max((Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0), 0), 0)
        }
        const aPagar = aberto(pagarTodos)
        const aReceber = aberto(receberTodos)
        const ativos = estoque.pecas + estoque.maquinas + frotaAtual + aReceber
        const patr = ativos - aPagar

        rows.push({
          data: dataISO,
          conta_omie: isAll ? 'TODAS' : labelConta(c),
          estoque_pecas: +estoque.pecas.toFixed(2),
          estoque_maquinas: +estoque.maquinas.toFixed(2),
          frota: +frotaAtual.toFixed(2),
          a_receber_aberto: +aReceber.toFixed(2),
          a_pagar_aberto: +aPagar.toFixed(2),
          patrimonio_operacional: +patr.toFixed(2),
          // Corrosao SELIC: usa o valor ATUAL (nao temos historico).
          // Vai aparecer flat no chart pra datas backfilled - usuario sabe.
          custo_capital_acumulado: +(estoque.custo_capital_acumulado || 0).toFixed(2),
        })
      }
    }

    // Upsert em chunks. Fallback: se a coluna custo_capital_acumulado nao
    // existe ainda (migracao SQL pendente), retry sem ela.
    const CHUNK = 200
    let usarCorrosao = true
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      const payload = usarCorrosao ? slice : slice.map(({ custo_capital_acumulado, ...rest }: any) => rest)
      const { error } = await db.from('cp_patrimonio_snapshot')
        .upsert(payload, { onConflict: 'data,conta_omie' })
      if (error && /custo_capital_acumulado/.test(error.message)) {
        usarCorrosao = false
        i -= CHUNK // retry esse chunk sem a coluna
        continue
      }
      if (error) throw new Error('upsert chunk: ' + error.message)
      snapshotsCriados += slice.length
    }

    return NextResponse.json({
      ok: true,
      dias_processados: Math.floor(diasAtras / passo) + 1,
      snapshots: snapshotsCriados,
      aviso: 'Estoque/frota usam valor ATUAL como aproximacao (sem historico real). A_receber/a_pagar sao reconstruidos das datas de emissao/pagamento.',
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
