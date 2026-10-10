// POPs — gerar as execuções recorrentes do dia. SERVER-ONLY.
// Idempotente: pops_criar_execucao devolve NULL quando (agendamento, data) já
// existe (UNIQUE no banco) — rodar 2x no mesmo dia não duplica nada.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { carregarTicket, notificarTicket } from '@/lib/tickets/server'
import { venceEm, type AgendamentoRef } from './regras'
import { rpc } from './server'

interface AgRow extends AgendamentoRef { id: string; pop_id: string; responsavel_padrao_id: string }

export async function gerarExecucoesDoDia(dataISO: string) {
  const ags: AgRow[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabaseAdmin.from('pops_agendamentos').select('*')
      .eq('ativo', true).order('id').range(de, de + 999)
    if (error) throw error
    ags.push(...((data || []) as AgRow[]))
    if (!data || data.length < 1000) break
  }
  const devidos = ags.filter((a) => venceEm(a, dataISO))
  const popIds = [...new Set(devidos.map((a) => a.pop_id))]
  const pops = popIds.length
    ? (await supabaseAdmin.from('pops').select('id, codigo, titulo, dono_id, arquivado').in('id', popIds)).data || []
    : []
  const porId = new Map(pops.map((p) => [p.id as string, p]))

  const out = { data: dataISO, agendamentos: ags.length, devidos: devidos.length, criadas: 0, ja_existiam: 0, puladas: [] as string[], erros: [] as string[] }
  for (const a of devidos) {
    const pop = porId.get(a.pop_id)
    if (!pop || pop.arquivado) { out.puladas.push(`${a.id}: POP arquivado/ausente`); continue }
    try {
      const ticketId = await rpc<string | null>('pops_criar_execucao', {
        p_pop: a.pop_id, p_solicitante: pop.dono_id, p_responsavel: a.responsavel_padrao_id,
        p_prazo: null, p_ref_externa: null, p_agendamento: a.id, p_data_referencia: dataISO, p_visibilidade: 'privado',
      })
      await supabaseAdmin.from('pops_agendamentos')
        .update({ ultima_geracao_em: new Date().toISOString(), ultima_data_referencia: dataISO }).eq('id', a.id)
      if (!ticketId) { out.ja_existiam++; continue }
      out.criadas++
      const t = await carregarTicket(ticketId)
      if (t) await notificarTicket(t.ticket, [a.responsavel_padrao_id], null,
        `Hoje: ${pop.codigo} — ${pop.titulo}`, 'Execução recorrente do POP.', 'tarefa_nova')
    } catch (e) {
      out.erros.push(`${pop.codigo}: ${(e as Error).message}`)
    }
  }
  return out
}
