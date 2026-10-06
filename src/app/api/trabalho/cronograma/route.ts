// =============================================================================
// CENTRAL DE TRABALHO — ações entre Cronograma e Tickets.
// POST /api/trabalho/cronograma
//   { acao:'iniciar', tarefa_id, responsavel_id? }   etapa → ticket no quadro
//   { acao:'planejar', ticket_id, duracao, inicio? } ticket → etapa no cronograma
//   { acao:'ligar', projeto_id, quadro_id? | criar:true }  projeto ↔ quadro
// =============================================================================
import { temCentral } from '@/lib/trabalho/modulo'
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import {
  temModuloTickets, carregarTicket, podeVerTicket, garantirParticipante, registrarEvento, notificarTicket,
} from '@/lib/tickets/server'
import { carregarQuadro, papeis } from '@/lib/tickets/quadros-server'
import { cronogramaAdmin } from '@/lib/cronograma/supabase-server'
import { iniciarEtapa, planejarTicket, ligarProjetoAoQuadro, ErroTrabalho } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const temCronograma = auth.isAdmin || temCentral(auth.modulos)
  if (!temModuloTickets(auth) && !temCronograma) return erro('Sem permissão', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao || '')

  try {
    if (acao === 'iniciar') {
      const tarefaId = String(body.tarefa_id || '')
      // quem inicia precisa poder trabalhar no quadro ligado ao projeto
      const { data: t } = await cronogramaAdmin().schema('cronograma').from('tarefas').select('projeto_id').eq('id', tarefaId).maybeSingle()
      if (!t) return erro('Etapa não encontrada', 404)
      const { data: p } = await cronogramaAdmin().schema('cronograma').from('projetos').select('quadro_id').eq('id', t.projeto_id).maybeSingle()
      if (p?.quadro_id) {
        const c = await carregarQuadro(p.quadro_id)
        if (c && !papeis(c, auth).trabalhar) return erro('Você não é integrante do quadro deste projeto.', 403)
      }
      const resp = body.responsavel_id ? String(body.responsavel_id) : null
      const { ticket } = await iniciarEtapa(tarefaId, auth.userId, resp)
      await garantirParticipante(ticket.id, auth.userId, null)
      if (ticket.responsavel_id !== auth.userId) await garantirParticipante(ticket.id, ticket.responsavel_id, auth.userId)
      await registrarEvento(ticket.id, auth.userId, 'criacao', { titulo: ticket.titulo, responsavel_id: ticket.responsavel_id, origem: 'cronograma' })
      await notificarTicket(ticket, [ticket.responsavel_id], auth.userId,
        `Novo ticket #${ticket.numero}: ${ticket.titulo}`, 'Etapa do cronograma iniciada. Confirme se consegue fazer.')
      return NextResponse.json({ ticket })
    }

    if (acao === 'planejar') {
      const c = await carregarTicket(String(body.ticket_id || ''))
      if (!c || !(await podeVerTicket(c.ticket, c.participantes, auth))) return erro('Ticket não encontrado', 404)
      const t = c.ticket
      if (t.solicitante_id !== auth.userId && t.responsavel_id !== auth.userId && !auth.isAdmin) return erro('Só o solicitante ou o responsável planeja o ticket.', 403)
      const { tarefaId } = await planejarTicket(t, { duracao: Number(body.duracao) || 1, inicio: body.inicio ? String(body.inicio) : null })
      await registrarEvento(t.id, auth.userId, 'edicao', { campo: 'cronograma', para: 'planejado' })
      return NextResponse.json({ ok: true, tarefa_id: tarefaId })
    }

    if (acao === 'ligar') {
      if (!temCronograma) return erro('Só quem tem o Cronograma liga projetos a quadros.', 403)
      const quadroId = body.quadro_id ? String(body.quadro_id) : null
      if (quadroId) {
        const c = await carregarQuadro(quadroId)
        if (!c || !papeis(c, auth).trabalhar) return erro('Você não é integrante deste quadro.', 403)
      }
      const r = await ligarProjetoAoQuadro(String(body.projeto_id || ''), quadroId, body.criar === true ? auth.userId : undefined)
      return NextResponse.json({ ok: true, quadro_id: r.quadroId })
    }

    return erro('Ação desconhecida')
  } catch (e) {
    if (e instanceof ErroTrabalho) return erro(e.message, e.status)
    console.error('[trabalho/cronograma]', acao, e)
    return erro('Erro inesperado', 500)
  }
}
