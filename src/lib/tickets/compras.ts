// Solicitação de Compras (SC — tipo='compras') — máquina de estados do trilho
// de alçadas (vendedor → diretoria → financeiro → comprador), compartilhada
// entre a UI (quais botões mostrar) e o server (validação real), no mesmo
// espírito de TRANSICOES_RESPONSAVEL em constantes.ts.
//
// ESTE módulo é CLIENT-SAFE (só tipos + funções puras). Os helpers que tocam
// o banco (config, avaliação de bloqueio) vivem em ./compras-server.
import type { Autenticado } from '@/lib/auth/server'
import type { TicketStatus } from './constantes'

// ---------------------------------------------------------------------
// Etapas do trilho
// ---------------------------------------------------------------------
export type ScEtapa =
  | 'vendedor'    // devolvida ao vendedor para revisar/reenviar
  | 'diretoria'   // bola com a Diretoria de Compras
  | 'financeiro'  // bola com o Financeiro
  | 'comprador'   // bola com o Comprador
  | 'concluida'   // PC emitido (terminal de sucesso)
  | 'cancelada'   // encerrada sem PC (terminal)

// Papéis com pessoa fixa designada (uma por etapa).
export type ScPapel = 'diretoria' | 'financeiro' | 'comprador'

export const SC_ETAPAS_ATIVAS: ScEtapa[] = ['diretoria', 'financeiro', 'comprador']
export const SC_ETAPAS_FINAIS: ScEtapa[] = ['concluida', 'cancelada']

// Rótulo/cor por etapa + projeção no status genérico (para o resto do motor
// — cron de auto-fecho, badges, filtros — continuar funcionando).
export const SC_ETAPA_INFO: Record<ScEtapa, { label: string; cor: string; fundo: string; status: TicketStatus }> = {
  vendedor:   { label: 'Com o vendedor',  cor: '#0891b2', fundo: 'rgba(8,145,178,.12)',  status: 'aguardando_interno' },
  diretoria:  { label: 'Diretoria',       cor: '#2563eb', fundo: 'rgba(37,99,235,.12)',  status: 'aguardando_interno' },
  financeiro: { label: 'Financeiro',      cor: '#d97706', fundo: 'rgba(217,119,6,.12)',  status: 'aguardando_interno' },
  comprador:  { label: 'Comprador',       cor: '#7c3aed', fundo: 'rgba(124,58,237,.12)', status: 'aguardando_interno' },
  concluida:  { label: 'Concluída',       cor: '#059669', fundo: 'rgba(5,150,105,.12)',  status: 'fechado' },
  cancelada:  { label: 'Cancelada',       cor: '#dc2626', fundo: 'rgba(220,38,38,.12)',  status: 'cancelado' },
}

// ---------------------------------------------------------------------
// Transições do trilho — fonte única (UI + server).
//   papel:   quem pode executar (além do admin). 'solicitante' = o vendedor
//            que abriu a SC. null = qualquer participante.
//   exigeTexto: transição exige justificativa/parecer gravado na timeline.
// ---------------------------------------------------------------------
export type ScAcao =
  | 'alterar_qtd' | 'devolver' | 'reenviar' | 'aprovar' | 'reprovar' | 'emitir_pc' | 'cancelar'

export interface ScTransicao {
  acao: ScAcao
  para: ScEtapa
  papel: ScPapel | 'solicitante' | null
  exigeTexto: boolean
  rotulo: string
}

export const SC_TRANSICOES: Record<ScEtapa, ScTransicao[]> = {
  diretoria: [
    { acao: 'alterar_qtd', para: 'financeiro', papel: 'diretoria', exigeTexto: true,  rotulo: 'Definir quantidade e enviar ao Financeiro' },
    { acao: 'devolver',    para: 'vendedor',   papel: 'diretoria', exigeTexto: true,  rotulo: 'Devolver ao vendedor' },
    { acao: 'cancelar',    para: 'cancelada',  papel: 'solicitante', exigeTexto: false, rotulo: 'Cancelar solicitação' },
  ],
  vendedor: [
    { acao: 'reenviar', para: 'diretoria', papel: 'solicitante', exigeTexto: false, rotulo: 'Reenviar à Diretoria' },
    { acao: 'cancelar', para: 'cancelada', papel: 'solicitante', exigeTexto: false, rotulo: 'Cancelar solicitação' },
  ],
  financeiro: [
    { acao: 'aprovar',  para: 'comprador', papel: 'financeiro', exigeTexto: true, rotulo: 'Aprovar (com parecer) e enviar ao Comprador' },
    { acao: 'reprovar', para: 'diretoria', papel: 'financeiro', exigeTexto: true, rotulo: 'Reprovar e devolver à Diretoria' },
    { acao: 'cancelar', para: 'cancelada', papel: 'solicitante', exigeTexto: false, rotulo: 'Cancelar solicitação' },
  ],
  comprador: [
    { acao: 'emitir_pc', para: 'concluida',  papel: 'comprador', exigeTexto: true, rotulo: 'Emitir Pedido de Compra' },
    { acao: 'devolver',  para: 'financeiro', papel: 'comprador', exigeTexto: true, rotulo: 'Devolver ao Financeiro' },
    { acao: 'cancelar',  para: 'cancelada',  papel: 'solicitante', exigeTexto: false, rotulo: 'Cancelar solicitação' },
  ],
  concluida: [],
  cancelada: [],
}

// ---------------------------------------------------------------------
// Campos estruturados da SC (payload do ticket). Os TEXTOS de registro
// (justificativa, parecer) moram nos EVENTOS, não aqui.
// ---------------------------------------------------------------------
export interface PayloadSC {
  produto?: string
  produto_codigo?: string
  quantidade_solicitada?: number
  quantidade_aprovada?: number
  preco_alvo?: number
  valor_unitario?: number
  valor_total?: number
  cliente_destino?: string
  pv_numero?: string
  pedido_omie_numero?: string
  prazo_compromisso?: string // ISO date
  bloqueio?: { motivo: string; valor: number } | null
}

// ---------------------------------------------------------------------
// Config (pessoas fixas por etapa + limiares do gatilho).
// A leitura do banco está em ./compras-server; aqui só o tipo + funções puras.
// ---------------------------------------------------------------------
export interface ConfigCompras {
  diretoria_id: string | null
  financeiro_id: string | null
  comprador_id: string | null
  valor_limite_bloqueio: number | null
  qtd_excesso_estoque: number | null
}

// A pessoa fixa designada para o papel de uma etapa (null se não configurada).
export function pessoaDoPapel(config: ConfigCompras, papel: ScPapel): string | null {
  if (papel === 'diretoria') return config.diretoria_id
  if (papel === 'financeiro') return config.financeiro_id
  return config.comprador_id
}

// O usuário pode executar uma transição, dado seu papel no ticket? (puro)
export function podeExecutar(
  t: ScTransicao,
  auth: { userId: string; isAdmin: boolean },
  config: ConfigCompras,
  solicitanteId: string,
): boolean {
  if (auth.isAdmin) return true
  if (t.papel === 'solicitante') return auth.userId === solicitanteId
  if (t.papel === null) return true
  return pessoaDoPapel(config, t.papel) === auth.userId
}

// Etapa alvo → responsável (a "bola"). Etapas terminais / devolução ao vendedor
// mantêm o solicitante como responsável para a SC seguir na fila dele.
export function proximoResponsavel(para: ScEtapa, config: ConfigCompras, solicitanteId: string): string {
  if (para === 'diretoria') return pessoaDoPapel(config, 'diretoria') || solicitanteId
  if (para === 'financeiro') return pessoaDoPapel(config, 'financeiro') || solicitanteId
  if (para === 'comprador') return pessoaDoPapel(config, 'comprador') || solicitanteId
  return solicitanteId // vendedor / concluida / cancelada
}

// Compat: aceita o Autenticado inteiro do server (subconjunto {userId,isAdmin}).
export function podeExecutarAuth(
  t: ScTransicao,
  auth: Autenticado,
  config: ConfigCompras,
  solicitanteId: string,
): boolean {
  return podeExecutar(t, { userId: auth.userId, isAdmin: auth.isAdmin }, config, solicitanteId)
}
