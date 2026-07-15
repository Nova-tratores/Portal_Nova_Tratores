// Tickets — TODAS as mutações do ticket passam por aqui (service role).
// POST /api/tickets/:id/acoes  { acao, ...campos }
//
// Ações: comentar | transferir | status | pedir_atualizacao |
//        participante_add | participante_remover | visibilidade | editar
//
// Regras (conceito seções 3–4): responsável único; transferência direta sem
// aceite (responsável atual ou solicitante); timeline append-only; participante
// nunca sai como efeito colateral; cobrança ("pedir atualização") é pública.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloTickets, carregarTicket, podeVer, ehParticipanteAtivo, envolvidos,
  garantirParticipante, registrarEvento, notificarTicket, validarTransicao, camposDoStatus,
} from '@/lib/tickets/server'
import { STATUS_FINAIS, STATUS_INFO, type Ticket, type TicketParticipante, type TicketStatus } from '@/lib/tickets/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function erro(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function ehEnvolvido(t: Ticket, participantes: TicketParticipante[], auth: Autenticado): boolean {
  return t.solicitante_id === auth.userId
    || t.responsavel_id === auth.userId
    || ehParticipanteAtivo(participantes, auth.userId)
}

async function nomeDe(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return data?.nome || 'alguém'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const acao = String(body.acao || '')

  const carregado = await carregarTicket(id)
  if (!carregado) return erro('Ticket não encontrado', 404)
  const { ticket, participantes } = carregado
  if (!podeVer(ticket, participantes, auth)) return erro('Ticket não encontrado', 404)

  const encerrado = STATUS_FINAIS.includes(ticket.status)
  const souResponsavel = ticket.responsavel_id === auth.userId
  const souSolicitante = ticket.solicitante_id === auth.userId
  const todos = envolvidos(ticket, participantes)

  // ------------------------------------------------------------- comentar
  if (acao === 'comentar') {
    if (encerrado) return erro('Ticket encerrado — não aceita novos comentários.')
    const texto = String(body.texto || '').trim()
    if (!texto) return erro('Escreva o comentário')
    // Em ticket público, comentar te torna participante (entrar é fácil).
    if (!ehEnvolvido(ticket, participantes, auth)) {
      await garantirParticipante(id, auth.userId, auth.userId)
      await registrarEvento(id, auth.userId, 'participante_adicionado', { user_id: auth.userId, auto: true })
    }
    const err = await registrarEvento(id, auth.userId, 'comentario', { texto })
    if (err) return erro(err, 500)
    const autor = await nomeDe(auth.userId)
    await notificarTicket(ticket, todos, auth.userId,
      `${autor} comentou no ticket #${ticket.numero}`,
      texto.length > 120 ? texto.slice(0, 117) + '...' : texto)
    return NextResponse.json({ ok: true })
  }

  // ----------------------------------------------------------- transferir
  if (acao === 'transferir') {
    if (encerrado) return erro('Ticket encerrado — não pode ser transferido.')
    if (!souResponsavel && !souSolicitante && !auth.isAdmin) {
      return erro('Só o responsável atual ou o solicitante podem transferir.', 403)
    }
    const para = String(body.para || '').trim()
    if (!para) return erro('Escolha o novo responsável')
    if (para === ticket.responsavel_id) return erro('Este usuário já é o responsável.')
    const { data: novo } = await supabaseAdmin
      .from('financeiro_usu').select('id, nome, ativo').eq('id', para).maybeSingle()
    if (!novo || novo.ativo === false) return erro('Novo responsável inválido ou inativo')

    const anterior = ticket.responsavel_id
    const { error } = await supabaseAdmin.from('tickets').update({ responsavel_id: para }).eq('id', id)
    if (error) return erro(error.message, 500)

    // O ticket sai da fila pessoal do responsável anterior.
    await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', id).eq('user_id', anterior)

    // ADR-002/003: o anterior permanece participante; o novo entra.
    await garantirParticipante(id, anterior, auth.userId)
    await garantirParticipante(id, para, auth.userId)
    await registrarEvento(id, auth.userId, 'transferencia', { de: anterior, para })
    await notificarTicket({ ...ticket, responsavel_id: para }, [...todos, para], auth.userId,
      `Ticket #${ticket.numero} transferido para ${novo.nome}`,
      ticket.titulo)
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------------- status
  if (acao === 'status') {
    const para = String(body.para || '') as TicketStatus
    if (!STATUS_INFO[para]) return erro('Status inválido')
    const invalida = validarTransicao(ticket, para, auth)
    if (invalida) return erro(invalida, 403)
    const motivo = String(body.motivo || '').trim()

    const { error } = await supabaseAdmin.from('tickets').update(camposDoStatus(para)).eq('id', id)
    if (error) return erro(error.message, 500)
    // Encerrou: sai da fila pessoal de todo mundo.
    if (STATUS_FINAIS.includes(para)) {
      await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', id)
    }
    await registrarEvento(id, auth.userId, 'status', { de: ticket.status, para, ...(motivo ? { motivo } : {}) })

    const autor = await nomeDe(auth.userId)
    const rotulo = STATUS_INFO[para].label
    await notificarTicket(ticket, todos, auth.userId,
      `Ticket #${ticket.numero}: ${rotulo}`,
      `${autor} mudou o status para "${rotulo}"${motivo ? ` — ${motivo}` : ''}`)
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------- pedir atualização
  if (acao === 'pedir_atualizacao') {
    if (encerrado) return erro('Ticket encerrado.')
    if (souResponsavel) return erro('Você já é o responsável — a bola está com você.')
    if (!ehEnvolvido(ticket, participantes, auth) && !auth.isAdmin) {
      return erro('Só envolvidos podem pedir atualização.', 403)
    }
    const texto = String(body.texto || '').trim()
    const err = await registrarEvento(id, auth.userId, 'pedido_atualizacao', texto ? { texto } : {})
    if (err) return erro(err, 500)
    const autor = await nomeDe(auth.userId)
    await notificarTicket(ticket, [ticket.responsavel_id], auth.userId,
      `${autor} pediu atualização no ticket #${ticket.numero}`,
      texto || ticket.titulo)
    return NextResponse.json({ ok: true })
  }

  // ------------------------------------------------------ participantes
  if (acao === 'participante_add') {
    if (encerrado) return erro('Ticket encerrado.')
    if (!ehEnvolvido(ticket, participantes, auth) && !auth.isAdmin) return erro('Sem permissão', 403)
    const userId = String(body.user_id || '').trim()
    if (!userId) return erro('Escolha o usuário')
    if (envolvidos(ticket, participantes).includes(userId)) return erro('Este usuário já participa do ticket.')
    const { data: u } = await supabaseAdmin
      .from('financeiro_usu').select('id, nome, ativo').eq('id', userId).maybeSingle()
    if (!u || u.ativo === false) return erro('Usuário inválido ou inativo')

    await garantirParticipante(id, userId, auth.userId)
    await registrarEvento(id, auth.userId, 'participante_adicionado', { user_id: userId })
    await notificarTicket(ticket, [userId], auth.userId,
      `Você foi adicionado ao ticket #${ticket.numero}`, ticket.titulo)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'participante_remover') {
    const userId = String(body.user_id || '').trim()
    if (!userId) return erro('Usuário não informado')
    // Saída explícita: o próprio, o solicitante ou um admin (ADR-002).
    if (userId !== auth.userId && !souSolicitante && !auth.isAdmin) return erro('Sem permissão', 403)
    if (userId === ticket.solicitante_id) return erro('O solicitante não sai do próprio ticket.')
    if (userId === ticket.responsavel_id) return erro('O responsável atual não pode ser removido — transfira primeiro.')
    if (!ehParticipanteAtivo(participantes, userId)) return erro('Este usuário não é participante ativo.')

    await supabaseAdmin
      .from('tickets_participantes')
      .update({ removido_em: new Date().toISOString() })
      .eq('ticket_id', id).eq('user_id', userId)
    await registrarEvento(id, auth.userId, 'participante_removido', { user_id: userId })
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------- visibilidade
  if (acao === 'visibilidade') {
    if (!souSolicitante && !auth.isAdmin) return erro('Só o solicitante altera a visibilidade.', 403)
    const para = body.para === 'publico' ? 'publico' : 'privado'
    if (para === ticket.visibilidade) return erro('O ticket já está assim.')
    const { error } = await supabaseAdmin.from('tickets').update({ visibilidade: para }).eq('id', id)
    if (error) return erro(error.message, 500)
    await registrarEvento(id, auth.userId, 'edicao', { campo: 'visibilidade', de: ticket.visibilidade, para })
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------------- editar
  // Título, categoria, prazo e terceiro podem ser ajustados pelo responsável
  // ou solicitante. A DESCRIÇÃO de origem é imutável (pergunta 7 do conceito).
  if (acao === 'editar') {
    if (encerrado) return erro('Ticket encerrado.')
    if (!souResponsavel && !souSolicitante && !auth.isAdmin) return erro('Sem permissão', 403)
    const patch: Record<string, unknown> = {}
    const mudancas: Record<string, { de: unknown; para: unknown }> = {}
    for (const campo of ['titulo', 'categoria', 'terceiro_envolvido'] as const) {
      if (typeof body[campo] === 'string' && String(body[campo]).trim() !== ticket[campo]) {
        const valor = String(body[campo]).trim()
        if (campo === 'titulo' && !valor) return erro('O título não pode ficar vazio')
        patch[campo] = valor
        mudancas[campo] = { de: ticket[campo], para: valor }
      }
    }
    if ('prazo' in body) {
      const novoPrazo = body.prazo ? String(body.prazo) : null
      if (novoPrazo !== ticket.prazo) {
        patch.prazo = novoPrazo
        mudancas.prazo = { de: ticket.prazo, para: novoPrazo }
      }
    }
    if (Object.keys(patch).length === 0) return erro('Nada para alterar')
    const { error } = await supabaseAdmin.from('tickets').update(patch).eq('id', id)
    if (error) return erro(error.message, 500)
    await registrarEvento(id, auth.userId, 'edicao', { mudancas })
    return NextResponse.json({ ok: true })
  }

  return erro('Ação desconhecida')
}
