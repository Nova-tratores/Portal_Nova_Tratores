// Retrato diário do Patrimônio (cp_patrimonio_snapshot): uma linha por conta + TODAS.
// Usado pelo botão da tela /dre-financeiro/patrimonio e pela tarefa do agendador
// `dre-patrimonio-snapshot` (antes quem gravava todo dia às 06:42 era o app antigo
// financeiro-omie-dashboard no Railway, fora do portal). Só lê o banco: não chama a Omie.
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { calcularPatrimonio } from '@/lib/dre-financeiro/calc'
import { hoje, fmtISO } from '@/lib/dre-financeiro/dates'
import { getContasOmie, labelConta } from '@/lib/dre-financeiro/omie-api'

export async function gravarSnapshotPatrimonio(): Promise<{ data: string; resultados: Array<{ conta: string; patrimonio: number }> }> {
  if (!supabase) throw new Error('Supabase nao configurado')
  const dataISO = fmtISO(hoje())
  const contas = (getContasOmie() as Array<{ id: string }>).map((c) => c.id).concat(['todas'])
  const resultados: Array<{ conta: string; patrimonio: number }> = []
  for (const c of contas) {
    const p = await calcularPatrimonio(c)
    const row: Record<string, unknown> = {
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
      const semCorrosao = { ...row }
      delete semCorrosao.custo_capital_acumulado
      ;({ error } = await supabase.from('cp_patrimonio_snapshot')
        .upsert(semCorrosao, { onConflict: 'data,conta_omie' }))
    }
    if (error) throw new Error(`upsert ${c}: ${error.message}`)
    resultados.push({ conta: c, patrimonio: p.patrimonio_operacional })
  }
  return { data: dataISO, resultados }
}
