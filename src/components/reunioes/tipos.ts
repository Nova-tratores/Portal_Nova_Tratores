// Reuniões — formato que GET /api/reunioes/[id] devolve para as telas.
import type { Ticket, UsuarioMin } from '@/lib/tickets/constantes'
import type { ItemPauta, Serie, ReuniaoEtapa, PapelReuniao, Pendencia, ReuniaoRef } from '@/lib/reunioes/regras'

export interface PresencaUI {
  reuniao_id: string; usuario_id: string; papel: PapelReuniao; presente: boolean | null; marcado_em: string | null
  /** convite (sql/reunioes-convite.sql): null/ausente = ainda não respondeu */
  resposta?: 'aceito' | 'recusado' | null
  respondido_em?: string | null
}
export interface AtaUI { reuniao_id: string; publicada_em: string; publicada_por: string; snapshot: Record<string, unknown>; texto_whatsapp: string }
export interface AcaoUI { id: string; numero: number; titulo: string; status: string; prazo: string | null; responsavel_id: string; aceite: string | null; origem_reuniao_item_id: string | null; prazo_reprogramacoes: number }

export interface ReuniaoUI {
  reuniao: Ticket
  serie: Serie | null
  itens: ItemPauta[]
  presencas: PresencaUI[]
  ata: AtaUI | null
  etapa_efetiva: ReuniaoEtapa
  corte_em: string | null
  pendencias: { atrasadas: Pendencia[]; vencendo: Pendencia[]; concluidas: { n: number; titulos: string[] }; limite: string; desde: string | null }
  acoes: AcaoUI[]
  usuarios: Record<string, UsuarioMin>
  condutor_id: string
  secretario_id: string | null
  /** só para quem conduz/criou: celular de cada pessoa (null = sem cadastro) e o texto pronto do convite no WhatsApp */
  convite?: { celulares: Record<string, string | null>; textos: Record<string, string> } | null
  meu_papel: PapelReuniao | null
  posso_conduzir: boolean
  criador_id?: string | null
  posso_reabrir?: boolean
  /** muda dia/hora/duração antes de começar (quem conduz, quem criou ou admin) */
  posso_remarcar?: boolean
  /** muda título e descrição até publicar a ata (quem conduz, quem criou ou admin) */
  posso_editar?: boolean
  /** reunião avulsa → série (quem conduz, quem criou ou admin) */
  posso_virar_serie?: boolean
  /** marcar reunião seguinte (ramificação) a partir desta */
  posso_continuar?: boolean
  aviso: string | null
  tempo_previsto: number
  duracao_min: number
  /** item daqui → reunião que recebeu a cópia (adiado/fora do tema) */
  destinos?: Record<string, ReuniaoRef>
  /** item_origem_id → reunião de onde o item veio */
  origens?: Record<string, ReuniaoRef>
  proxima?: ReuniaoRef | null
  /** sala reservada para esta reunião */
  sala?: { id: string; nome: string; inicio: string; fim: string } | null
}
