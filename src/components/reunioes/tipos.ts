// Reuniões — formato que GET /api/reunioes/[id] devolve para as telas.
import type { Ticket, UsuarioMin } from '@/lib/tickets/constantes'
import type { ItemPauta, Serie, ReuniaoEtapa, PapelReuniao, Pendencia } from '@/lib/reunioes/regras'

export interface PresencaUI { reuniao_id: string; usuario_id: string; papel: PapelReuniao; presente: boolean | null; marcado_em: string | null }
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
  meu_papel: PapelReuniao | null
  posso_conduzir: boolean
  aviso: string | null
  tempo_previsto: number
  duracao_min: number
}
