// =============================================================================
// CENTRAL DE TRABALHO — tarefa solta que cresceu.
// POST /api/trabalho/tarefas
//   { acao:'incluir', tarefa_id, ticket_id }              vira passo do ticket
//   { acao:'transformar', tarefa_id, quadro_id?, cronograma?: bool, duracao? }
//        → ticket (no quadro escolhido) + etapa no cronograma do quadro
// Só quem criou a tarefa, quem a recebeu ou admin.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloTickets, carregarTicket, podeVerTicket, garantirParticipante, registrarEvento, notificarTicket, envolvidos,
} from '@/lib/tickets/server'
import { carregarQuadro, papeis } from '@/lib/tickets/quadros-server'
import { colunaDoTicket } from '@/lib/tickets/quadros'
import { migrationFaltou } from '@/lib/marketing/erros'
import { carregarTarefa } from '@/lib/trabalho/tarefas-server'
import { planejarTicket, ErroTrabalho } from '@/lib/trabalho/cronograma-server'
import { STATUS_FINAIS, type Ticket } from '@/lib/tickets/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const MSG_MIGRATION = 'A Central de Trabalho ainda não foi ativada no banco (rode sql/central-trabalho.sql).'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao || '')

  try {
    const tarefa = await carregarTarefa(Number(body.tarefa_id))
    if (!tarefa) return erro('Tarefa não encontrada', 404)
    if (tarefa.criado_por !== auth.userId && tarefa.atribuido_a !== auth.userId && !auth.isAdmin) return erro('Só quem criou ou recebeu a tarefa pode mexer nela.', 403)
    if (tarefa.ticket_id) return erro('Esta tarefa já está ligada a um ticket.')

    if (acao === 'incluir') {
      const c = await carregarTicket(String(body.ticket_id || ''))
      if (!c || !(await podeVerTicket(c.ticket, c.participantes, auth))) return erro('Ticket não encontrado', 404)
      if (STATUS_FINAIS.includes(c.ticket.status)) return erro('Ticket encerrado — não aceita tarefas novas.')
      // Mesma regra de /api/tickets/:id/tarefas: envolvido, admin ou quem trabalha no bloco.
      const envolvido = auth.isAdmin || envolvidos(c.ticket, c.participantes).includes(auth.userId)
      const doBloco = !envolvido && c.ticket.quadro_id ? await carregarQuadro(c.ticket.quadro_id) : null
      if (!envolvido && !(doBloco && papeis(doBloco, auth).trabalhar)) return erro('Só quem participa do ticket inclui tarefas nele.', 403)
      const { error } = await supabaseAdmin.from('portal_tarefas').update({ ticket_id: c.ticket.id, papel_no_ticket: 'passo', updated_at: new Date().toISOString() }).eq('id', tarefa.id)
      if (error) throw Object.assign(new Error(error.message), { code: error.code })
      await registrarEvento(c.ticket.id, auth.userId, 'edicao', { campo: 'tarefa', acao: 'criada', titulo: tarefa.titulo })
      const { data: autor } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle()
      await notificarTicket(c.ticket, envolvidos(c.ticket, c.participantes), auth.userId,
        `${autor?.nome || 'Alguém'} adicionou uma tarefa no ticket #${c.ticket.numero}`, tarefa.titulo, 'tarefa_nova')
      return NextResponse.json({ ok: true, ticket_id: c.ticket.id })
    }

    if (acao === 'transformar') {
      const quadroId = body.quadro_id ? String(body.quadro_id) : null
      let coluna: string | null = null
      if (quadroId) {
        const q = await carregarQuadro(quadroId)
        if (!q || !papeis(q, auth).trabalhar) return erro('Você não é integrante deste quadro.', 403)
        coluna = colunaDoTicket(null, q.colunas)
      }
      const resp = tarefa.atribuido_a || auth.userId
      const { data: criado, error } = await supabaseAdmin.from('tickets').insert({
        titulo: String(tarefa.titulo).slice(0, 140),
        descricao: (tarefa.descricao ? tarefa.descricao + '\n\n' : '') + 'Criado a partir de uma tarefa (Central de Trabalho).',
        prazo: tarefa.prazo ? String(tarefa.prazo).slice(0, 10) : null,
        solicitante_id: auth.userId,
        responsavel_id: resp,
        ...(quadroId ? { quadro_id: quadroId, quadro_coluna_id: coluna } : {}),
        aceite: resp === auth.userId ? 'ok' : 'pendente',
      }).select('*').single()
      if (error || !criado) throw Object.assign(new Error(error?.message || 'Falha ao criar'), { code: error?.code })
      const ticket = criado as Ticket
      await supabaseAdmin.from('portal_tarefas').update({ ticket_id: ticket.id, papel_no_ticket: 'origem', updated_at: new Date().toISOString() }).eq('id', tarefa.id)
      await garantirParticipante(ticket.id, auth.userId, null)
      if (resp !== auth.userId) await garantirParticipante(ticket.id, resp, auth.userId)
      await registrarEvento(ticket.id, auth.userId, 'criacao', { titulo: ticket.titulo, responsavel_id: resp, origem: 'tarefa' })
      if (resp !== auth.userId) await notificarTicket(ticket, [resp], auth.userId, `Novo ticket #${ticket.numero}: ${ticket.titulo}`, 'Confirme se consegue fazer.')

      let noCronograma = false, avisoCronograma = ''
      if (body.cronograma === true && quadroId) {
        try { await planejarTicket(ticket, { duracao: Number(body.duracao) || 2 }); noCronograma = true }
        catch (e) { avisoCronograma = e instanceof ErroTrabalho ? e.message : 'Não foi possível pôr no cronograma.' }
      }
      return NextResponse.json({ ticket, noCronograma, avisoCronograma })
    }

    return erro('Ação desconhecida')
  } catch (e) {
    if (migrationFaltou(e)) return erro(MSG_MIGRATION, 503)
    console.error('[trabalho/tarefas]', acao, e)
    return erro('Erro inesperado', 500)
  }
}
