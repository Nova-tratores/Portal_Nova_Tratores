// =============================================================================
// API: patrimonio/snapshot - port FIEL de POST /api/patrimonio/snapshot do
// server.js (linhas 2164-2199). Backfill manual / forca o snapshot do dia atual
// para todas as contas (nova/castro/todas), persistindo em cp_patrimonio_snapshot.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { calcularPatrimonio } from '@/lib/dre-financeiro/calc'
import { hoje, fmtISO } from '@/lib/dre-financeiro/dates'
import { getContasOmie, labelConta } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const ref = hoje()
    const dataISO = fmtISO(ref)
    const contas = getContasOmie().map((c: any) => c.id).concat(['todas'])
    const resultados: any[] = []
    for (const c of contas) {
      const p = await calcularPatrimonio(c)
      const row: any = {
        data: dataISO,
        conta_omie: c === 'todas' ? 'TODAS' : labelConta(c),
        estoque_pecas: p.ativos.estoque_pecas,
        estoque_maquinas: p.ativos.estoque_maquinas,
        frota: p.ativos.frota,
        a_receber_aberto: p.ativos.a_receber_aberto,
        a_pagar_aberto: p.passivos.a_pagar_aberto,
        patrimonio_operacional: p.patrimonio_operacional,
        custo_capital_acumulado: p.custo_capital_acumulado,
      }
      let { error } = await supabase.from('cp_patrimonio_snapshot')
        .upsert(row, { onConflict: 'data,conta_omie' })
      if (error && /custo_capital_acumulado/.test(error.message)) {
        const { custo_capital_acumulado, ...semCorrosao } = row
        ;({ error } = await supabase.from('cp_patrimonio_snapshot')
          .upsert(semCorrosao, { onConflict: 'data,conta_omie' }))
      }
      if (error) throw new Error(`upsert ${c}: ${error.message}`)
      resultados.push({ conta: c, patrimonio: p.patrimonio_operacional })
    }
    return NextResponse.json({ ok: true, data: dataISO, resultados })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
