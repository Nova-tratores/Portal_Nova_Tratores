// POPs — iniciar uma execução avulsa (ticket tipo 'pop' na versão publicada vigente).
// POST /api/pops/execucoes { pop_id, responsavel_id?, ref_externa?, prazo?, visibilidade? }
// Quem pode: podeExecutar (pops:executar, editores e aprovadores da área, admin).
// O solicitante é quem iniciou; o responsável (quem executa) padrão é ele mesmo.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { carregarTicket, notificarTicket } from '@/lib/tickets/server'
import { atorDe, carregarPop, erro, erroBanco, rpc, usuarioAtivo } from '@/lib/pops/server'
import { podeExecutar, uuidValido } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const popId = String(body.pop_id || '')
    if (!uuidValido(popId)) return erro('POP não encontrado', 404)
    const ator = await atorDe(auth)
    const pop = await carregarPop(popId)
    if (!pop) return erro('POP não encontrado', 404)
    if (!podeExecutar(ator, pop)) return erro('Você não tem permissão para executar este POP.', 403)

    const responsavel = body.responsavel_id ? String(body.responsavel_id) : auth.userId
    if (!uuidValido(responsavel) || !(await usuarioAtivo(responsavel))) return erro('Responsável inválido ou inativo.')
    const prazo = body.prazo ? String(body.prazo) : null
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return erro('Prazo inválido.')
    const ref = body.ref_externa ? String(body.ref_externa).trim().slice(0, 80) : null

    const ticketId = await rpc<string | null>('pops_criar_execucao', {
      p_pop: popId, p_solicitante: auth.userId, p_responsavel: responsavel,
      p_prazo: prazo, p_ref_externa: ref, p_agendamento: null, p_data_referencia: null,
      p_visibilidade: body.visibilidade === 'publico' ? 'publico' : 'privado',
    })
    if (!ticketId) return erro('Não foi possível criar a execução.', 500)
    if (responsavel !== auth.userId) {
      const t = await carregarTicket(ticketId)
      if (t) await notificarTicket(t.ticket, [responsavel], auth.userId, `Executar ${pop.codigo}: ${pop.titulo}`,
        ref ? `Referência: ${ref}` : 'Você é o responsável por esta execução.', 'tarefa_nova')
    }
    return NextResponse.json({ ticket_id: ticketId }, { status: 201 })
  } catch (e) {
    return erroBanco(e)
  }
}
