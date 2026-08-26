// Livro de Decisões + Solicitação de Compras — tipos e constantes
// compartilhados entre client e server.
// Conceito: governanca_ledger_decisoes_e_comissao_v2.md (Fase 1).

export type StatusSC =
  | 'rascunho'
  | 'aguardando_diretoria'
  | 'aguardando_financeiro'
  | 'aprovada'
  | 'pc_emitida'
  | 'recusada'
  | 'cancelada'

export type Papel =
  | 'comercial'
  | 'diretoria_compras'
  | 'financeiro'
  | 'comprador'
  | 'sistema'

export type TipoDecisao =
  | 'sc_criada'
  | 'qtd_alterada'
  | 'parecer_financeiro'
  | 'pc_emitido'
  | 'alocacao_chassi'      // Fase 2
  | 'desconto_aprovado'    // Fase 2
  | 'venda_faturada'       // Fase 2
  | 'correcao'
  | 'cancelamento'
  | 'comentario'

export interface SolicitacaoCompra {
  id: string
  numero: number
  status: StatusSC
  conta_omie: string
  vendedor_id: string
  modelo: string
  produto_codigo: string
  cliente_codigo: string
  pedido_venda_ref: string
  qtd_solicitada: number
  qtd_atual: number
  preco_alvo: number | null
  pc_numero: string
  payload: Record<string, unknown>
  ultima_atividade_em: string
  created_at: string
  updated_at: string
}

export interface Decisao {
  id: string
  ocorrida_em: string
  ator_id: string | null
  papel: Papel
  tipo: TipoDecisao
  sc_id: string
  documento_ref: string | null
  chassi_id: string | null
  decisao_anterior: string | null
  estado_anterior: Record<string, unknown> | null
  estado_novo: Record<string, unknown> | null
  justificativa: string
  prazo_compromisso: string | null
}

export interface UsuarioMin {
  id: string
  nome: string
  avatar_url?: string | null
}

// ---------------------------------------------------------------------
// Rótulos de status da SC
// ---------------------------------------------------------------------
export const STATUS_INFO: Record<StatusSC, { label: string; cor: string; fundo: string }> = {
  rascunho:              { label: 'Rascunho',              cor: '#6b7280', fundo: 'rgba(107,114,128,.12)' },
  aguardando_diretoria:  { label: 'Aguardando diretoria',  cor: '#d97706', fundo: 'rgba(217,119,6,.12)' },
  aguardando_financeiro: { label: 'Aguardando financeiro', cor: '#0891b2', fundo: 'rgba(8,145,178,.12)' },
  aprovada:              { label: 'Aprovada',              cor: '#2563eb', fundo: 'rgba(37,99,235,.12)' },
  pc_emitida:            { label: 'PC emitido',            cor: '#059669', fundo: 'rgba(5,150,105,.12)' },
  recusada:              { label: 'Recusada',              cor: '#dc2626', fundo: 'rgba(220,38,38,.12)' },
  cancelada:             { label: 'Cancelada',             cor: '#9ca3af', fundo: 'rgba(156,163,175,.12)' },
}

export const STATUS_ATIVOS: StatusSC[] = [
  'aguardando_diretoria', 'aguardando_financeiro', 'aprovada',
]

export const STATUS_FINAIS: StatusSC[] = ['pc_emitida', 'recusada', 'cancelada']

export const PAPEL_INFO: Record<Papel, string> = {
  comercial: 'Comercial (vendedor)',
  diretoria_compras: 'Diretoria de Compras',
  financeiro: 'Financeiro',
  comprador: 'Comprador',
  sistema: 'Sistema',
}

export const TIPO_INFO: Record<TipoDecisao, string> = {
  sc_criada: 'SC criada',
  qtd_alterada: 'Lote/quantidade alterada',
  parecer_financeiro: 'Parecer do financeiro',
  pc_emitido: 'Pedido de Compra emitido',
  alocacao_chassi: 'Chassi alocado',
  desconto_aprovado: 'Desconto aprovado',
  venda_faturada: 'Venda faturada',
  correcao: 'Correção',
  cancelamento: 'Cancelamento',
  comentario: 'Comentário',
}

// ---------------------------------------------------------------------
// Máquina de estados / alçadas (Fase 1) — compartilhada entre a UI (botões
// disponíveis) e o server (validação real). Cada ação exige um papel e só
// vale a partir de certos status.
// ---------------------------------------------------------------------
export type AcaoWorkflow = 'alterar_qtd' | 'parecer' | 'emitir_pc' | 'cancelar'

export interface PassoWorkflow {
  acao: AcaoWorkflow
  label: string
  papeis: Papel[]       // quem pode (admin/módulo total também pode)
  de: StatusSC[]        // status de origem válidos
}

export const WORKFLOW: PassoWorkflow[] = [
  { acao: 'alterar_qtd', label: 'Diretoria — ajustar lote', papeis: ['diretoria_compras'], de: ['aguardando_diretoria'] },
  { acao: 'parecer',     label: 'Financeiro — dar parecer', papeis: ['financeiro'],         de: ['aguardando_financeiro'] },
  { acao: 'emitir_pc',   label: 'Comprador — registrar PC', papeis: ['comprador'],          de: ['aprovada'] },
  { acao: 'cancelar',    label: 'Cancelar',                 papeis: ['comercial', 'diretoria_compras', 'financeiro', 'comprador'], de: ['rascunho', 'aguardando_diretoria', 'aguardando_financeiro', 'aprovada'] },
]

// Ações que este usuário (com estes papéis) pode aplicar na SC neste status.
export function acoesDisponiveis(status: StatusSC, papeis: Papel[], isAdmin: boolean): PassoWorkflow[] {
  return WORKFLOW.filter((w) =>
    w.de.includes(status) && (isAdmin || w.papeis.some((p) => papeis.includes(p))),
  )
}

// Papel "principal" de um passo (para carimbar no ledger). Admin herda o papel
// exigido pela ação.
export const PAPEL_DA_ACAO: Record<AcaoWorkflow, Papel> = {
  alterar_qtd: 'diretoria_compras',
  parecer: 'financeiro',
  emitir_pc: 'comprador',
  cancelar: 'comercial', // o papel real é substituído pelo do ator no server
}

// Mapeia a permissão granular (decisoes:<acao>) ao papel do documento.
export const PAPEL_POR_PERMISSAO: Record<string, Papel> = {
  comercial: 'comercial',
  diretoria: 'diretoria_compras',
  financeiro: 'financeiro',
  comprador: 'comprador',
}

export function diasParado(ultimaAtividade: string): number {
  return Math.floor((Date.now() - new Date(ultimaAtividade).getTime()) / 86400000)
}

export function compromissoVencido(prazo: string | null, status: StatusSC): boolean {
  if (!prazo || STATUS_FINAIS.includes(status)) return false
  return new Date(prazo + 'T23:59:59') < new Date()
}
