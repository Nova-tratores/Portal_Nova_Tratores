// Tickets internos — regras de negócio no SERVIDOR (uso exclusivo nas rotas
// /api/tickets/*, via service role). O browser só LÊ (RLS); toda mutação passa
// por aqui para garantir transições válidas, timeline imutável e notificações.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { filtrarDestinatarios, type PrefsDestinatario } from '@/lib/notif/prefs'
import type { Autenticado } from '@/lib/auth/server'
import type { Ticket, TicketParticipante, TicketStatus, EventoTipo } from './constantes'
import { STATUS_FINAIS, TRANSICOES_RESPONSAVEL, TRANSICOES_SOLICITANTE } from './constantes'

// Acesso ao módulo (espelha temAcesso do usePermissoes, no servidor).
export function temModuloTickets(auth: Autenticado): boolean {
  if (auth.isAdmin) return true
  return auth.modulos.includes('tickets') || auth.modulos.some((m) => m.startsWith('tickets:'))
}

export interface TicketCarregado {
  ticket: Ticket
  participantes: TicketParticipante[]
}

export async function carregarTicket(id: string): Promise<TicketCarregado | null> {
  const { data: ticket } = await supabaseAdmin.from('tickets').select('*').eq('id', id).maybeSingle()
  if (!ticket) return null
  const { data: participantes } = await supabaseAdmin
    .from('tickets_participantes')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at')
  return { ticket: ticket as Ticket, participantes: (participantes || []) as TicketParticipante[] }
}

export function ehParticipanteAtivo(participantes: TicketParticipante[], userId: string): boolean {
  return participantes.some((p) => p.user_id === userId && !p.removido_em)
}

// Quem pode VER (espelha a função SQL tickets_pode_ver, pro server decidir 403/404).
export function podeVer(t: Ticket, participantes: TicketParticipante[], auth: Autenticado): boolean {
  if (auth.isAdmin) return true
  if (t.visibilidade === 'publico') return true
  if (t.solicitante_id === auth.userId || t.responsavel_id === auth.userId) return true
  return ehParticipanteAtivo(participantes, auth.userId)
}

// Envolvidos "ativos" de um ticket (para notificar): solicitante + responsável
// + participantes não removidos.
export function envolvidos(t: Ticket, participantes: TicketParticipante[]): string[] {
  const ids = new Set<string>([t.solicitante_id, t.responsavel_id])
  for (const p of participantes) if (!p.removido_em) ids.add(p.user_id)
  return [...ids]
}

// Garante presença na tabela de participantes (insere ou "revive" removido).
// Regra de ouro (ADR-002): entrar é fácil; ninguém sai como efeito colateral.
export async function garantirParticipante(ticketId: string, userId: string, adicionadoPor: string | null) {
  const { data: existente } = await supabaseAdmin
    .from('tickets_participantes')
    .select('id, removido_em')
    .eq('ticket_id', ticketId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!existente) {
    await supabaseAdmin.from('tickets_participantes').insert({
      ticket_id: ticketId, user_id: userId, adicionado_por: adicionadoPor,
    })
  } else if (existente.removido_em) {
    await supabaseAdmin.from('tickets_participantes').update({ removido_em: null }).eq('id', existente.id)
  }
}

// Timeline append-only + carimbo de última atividade.
export async function registrarEvento(
  ticketId: string,
  autorId: string | null,
  tipo: EventoTipo,
  payload: Record<string, unknown> = {},
): Promise<string | null> {
  const { error } = await supabaseAdmin.from('tickets_eventos').insert({
    ticket_id: ticketId, autor_id: autorId, tipo, payload,
  })
  if (error) return error.message
  await supabaseAdmin
    .from('tickets')
    .update({ ultima_atividade_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', ticketId)
  return null
}

// Notifica via portal_notificacoes (sino do portal). Nunca notifica o autor;
// respeita as preferências de silenciamento (módulo 'tickets').
export async function notificarTicket(
  t: Ticket,
  destinatarios: string[],
  autorId: string | null,
  titulo: string,
  descricao?: string,
) {
  const alvo = [...new Set(destinatarios)].filter((id) => id && id !== autorId)
  if (alvo.length === 0) return
  const { data: prefs } = await supabaseAdmin
    .from('portal_permissoes')
    .select('user_id, categoria, notif_silenciado')
    .in('user_id', alvo)
  const porPrefs = new Set(filtrarDestinatarios('tickets', (prefs || []) as PrefsDestinatario[]))
  // Quem não tem linha em portal_permissoes recebe mesmo assim (sem prefs = sem silêncio)
  const comLinha = new Set((prefs || []).map((p: { user_id: string }) => p.user_id))
  const finais = alvo.filter((id) => !comLinha.has(id) || porPrefs.has(id))
  if (finais.length === 0) return
  await supabaseAdmin.from('portal_notificacoes').insert(
    finais.map((user_id) => ({
      user_id,
      tipo: 'tickets',
      titulo,
      descricao: descricao || null,
      link: `/tickets/${t.id}`,
    })),
  )
}

// Devolve mensagem de erro ou null se a transição é permitida para este ator.
// (Mapa de transições em constantes.ts — compartilhado com a UI.)
export function validarTransicao(
  t: Ticket,
  para: TicketStatus,
  auth: Autenticado,
): string | null {
  if (STATUS_FINAIS.includes(t.status)) return 'Ticket já encerrado.'
  if (para === t.status) return 'O ticket já está neste status.'
  const souResponsavel = t.responsavel_id === auth.userId
  const souSolicitante = t.solicitante_id === auth.userId
  const doResp = (TRANSICOES_RESPONSAVEL[t.status] || []).includes(para)
  const doSol = (TRANSICOES_SOLICITANTE[t.status] || []).includes(para)
  if (auth.isAdmin && (doResp || doSol)) return null
  if (souResponsavel && doResp) return null
  if (souSolicitante && doSol) return null
  if (para === 'fechado') return 'Só o solicitante confirma o fechamento (após resolvido).'
  if (para === 'cancelado') return 'Só o solicitante pode cancelar o ticket.'
  return 'Você não pode fazer esta mudança de status.'
}

// Campos derivados de uma mudança de status.
export function camposDoStatus(para: TicketStatus): Partial<Ticket> {
  const agora = new Date().toISOString()
  if (para === 'resolvido') return { status: para, resolvido_em: agora }
  if (para === 'fechado') return { status: para, fechado_em: agora }
  if (para === 'cancelado') return { status: para, fechado_em: agora }
  return { status: para, resolvido_em: null }
}
