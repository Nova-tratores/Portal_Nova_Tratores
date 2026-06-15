// =============================================================================
// API: monitor/status - port FIEL de GET /api/monitor/status do server.js
// (linhas 4203-4218). Estado dos robos em memoria + ultima execucao de cada
// (modulo x conta) lida de qa_monitor_log.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'
// server.js importa getState do monitors como getMonitorState.
import { getState as getMonitorState, MODULOS, MODULO_LABEL } from '@/lib/dre-financeiro/monitors'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const estados: any = {}
    getContasOmie().forEach((c: any) => {
      MODULOS.forEach((m: string) => { estados[`${m}:${c.id}`] = getMonitorState(m, c.id) })
    })
    let ultimos: any[] = []
    const { data } = await supabase.from('qa_monitor_log')
      .select('modulo,conta_omie,status,verificados,anomalias_novas,anomalias_resolvidas,abertas_total,erro,inicio,fim')
      .order('inicio', { ascending: false }).limit(50)
    ultimos = data || []
    return NextResponse.json({ estados, ultimos, modulos: MODULOS, modulosLabel: MODULO_LABEL })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
