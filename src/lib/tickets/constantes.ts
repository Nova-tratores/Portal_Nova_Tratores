// Tickets internos — tipos e constantes compartilhados entre client e server.
// Conceito: docs/conceito-sistema-tickets (ADRs 001–007).

export type TicketStatus =
  | 'aberto'
  | 'em_andamento'
  | 'aguardando_terceiro'
  | 'aguardando_interno'
  | 'resolvido'
  | 'fechado'
  | 'cancelado'

export type TicketVisibilidade = 'privado' | 'publico'

export type EventoTipo =
  | 'criacao'
  | 'comentario'
  | 'status'
  | 'transferencia'
  | 'participante_adicionado'
  | 'participante_removido'
  | 'pedido_atualizacao'
  | 'edicao'
  | 'anexo'

export interface Ticket {
  id: string
  numero: number
  tipo: string
  titulo: string
  descricao: string
  categoria: string
  status: TicketStatus
  visibilidade: TicketVisibilidade
  prazo: string | null
  terceiro_envolvido: string
  solicitante_id: string
  responsavel_id: string
  payload: Record<string, unknown>
  resolvido_em: string | null
  fechado_em: string | null
  ultima_atividade_em: string
  created_at: string
  updated_at: string
}

export interface TicketParticipante {
  id: string
  ticket_id: string
  user_id: string
  adicionado_por: string | null
  removido_em: string | null
  created_at: string
}

export interface TicketEvento {
  id: string
  ticket_id: string
  autor_id: string | null
  tipo: EventoTipo
  payload: Record<string, unknown>
  created_at: string
}

export interface UsuarioMin {
  id: string
  nome: string
  avatar_url?: string | null
}

export const STATUS_INFO: Record<TicketStatus, { label: string; cor: string; fundo: string }> = {
  aberto:              { label: 'Aberto',              cor: '#2563eb', fundo: 'rgba(37,99,235,.12)' },
  em_andamento:        { label: 'Em andamento',        cor: '#d97706', fundo: 'rgba(217,119,6,.12)' },
  aguardando_terceiro: { label: 'Aguardando terceiro', cor: '#7c3aed', fundo: 'rgba(124,58,237,.12)' },
  aguardando_interno:  { label: 'Aguardando interno',  cor: '#0891b2', fundo: 'rgba(8,145,178,.12)' },
  resolvido:           { label: 'Resolvido',           cor: '#059669', fundo: 'rgba(5,150,105,.12)' },
  fechado:             { label: 'Fechado',             cor: '#6b7280', fundo: 'rgba(107,114,128,.12)' },
  cancelado:           { label: 'Cancelado',           cor: '#dc2626', fundo: 'rgba(220,38,38,.12)' },
}

export const STATUS_ATIVOS: TicketStatus[] = [
  'aberto', 'em_andamento', 'aguardando_terceiro', 'aguardando_interno', 'resolvido',
]

export const STATUS_FINAIS: TicketStatus[] = ['fechado', 'cancelado']

export const CATEGORIAS_SUGERIDAS = [
  'Frota / Seguros', 'Manutenção predial', 'RH', 'Financeiro', 'TI / Sistemas',
  'Compras', 'Comercial', 'Jurídico', 'Outros',
]

// Dias após "resolvido" para o fechamento automático sem manifestação do
// solicitante (ADR-004 — decisão pendente 4, adotada a sugestão do documento).
export const AUTO_FECHAR_DIAS = 7

// ---------------------------------------------------------------------
// Transições de status (seção 3 do conceito) — compartilhadas entre a UI
// (botões disponíveis) e o server (validação real).
// ---------------------------------------------------------------------
export const TRANSICOES_RESPONSAVEL: Partial<Record<TicketStatus, TicketStatus[]>> = {
  aberto: ['em_andamento', 'aguardando_terceiro', 'aguardando_interno', 'resolvido'],
  em_andamento: ['aguardando_terceiro', 'aguardando_interno', 'resolvido'],
  aguardando_terceiro: ['em_andamento', 'aguardando_interno', 'resolvido'],
  aguardando_interno: ['em_andamento', 'aguardando_terceiro', 'resolvido'],
  resolvido: ['em_andamento'], // voltar atrás antes do solicitante fechar
}

export const TRANSICOES_SOLICITANTE: Partial<Record<TicketStatus, TicketStatus[]>> = {
  aberto: ['cancelado'],
  em_andamento: ['cancelado'],
  aguardando_terceiro: ['cancelado'],
  aguardando_interno: ['cancelado'],
  resolvido: ['fechado', 'em_andamento', 'cancelado'], // confirmar, contestar (reabre) ou cancelar
}

// Status que o usuário pode aplicar, dado o papel dele no ticket.
export function statusDisponiveis(
  atual: TicketStatus,
  souResponsavel: boolean,
  souSolicitante: boolean,
  isAdmin: boolean,
): TicketStatus[] {
  const set = new Set<TicketStatus>()
  if (souResponsavel || isAdmin) for (const s of TRANSICOES_RESPONSAVEL[atual] || []) set.add(s)
  if (souSolicitante || isAdmin) for (const s of TRANSICOES_SOLICITANTE[atual] || []) set.add(s)
  set.delete(atual)
  return [...set]
}

export function diasParado(ultimaAtividade: string): number {
  return Math.floor((Date.now() - new Date(ultimaAtividade).getTime()) / 86400000)
}

export function prazoVencido(prazo: string | null, status: TicketStatus): boolean {
  if (!prazo || STATUS_FINAIS.includes(status)) return false
  return new Date(prazo + 'T23:59:59') < new Date()
}
