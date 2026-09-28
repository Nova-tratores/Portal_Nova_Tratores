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
export type ScDestino = 'cliente' | 'estoque'
export type ScConfianca = 'frio' | 'morno' | 'quente'

export const SC_DESTINO_LABEL: Record<ScDestino, string> = {
  cliente: 'Cliente definido',
  estoque: 'Compra para estoque',
}

// Grau de confiança na venda para o cliente destino.
export const SC_CONFIANCA_INFO: Record<ScConfianca, { label: string; dica: string; cor: string; fundo: string }> = {
  frio:   { label: 'Frio',   dica: 'Interesse inicial, sem proposta aceita',      cor: '#0284c7', fundo: 'rgba(2,132,199,.12)' },
  morno:  { label: 'Morno',  dica: 'Proposta na mesa, negociação em andamento',   cor: '#d97706', fundo: 'rgba(217,119,6,.14)' },
  quente: { label: 'Quente', dica: 'Venda fechada ou a um passo de fechar',       cor: '#dc2626', fundo: 'rgba(220,38,38,.12)' },
}

// Motivos prontos da justificativa. `destinos` = em qual destino o motivo aparece.
export interface ScMotivo { id: string; label: string; destinos: ScDestino[] }
export const SC_MOTIVOS: ScMotivo[] = [
  { id: 'venda_fechada',      label: 'Venda fechada (pedido de venda emitido)', destinos: ['cliente'] },
  { id: 'negociacao',         label: 'Negociação avançada com o cliente',       destinos: ['cliente'] },
  { id: 'reposicao_estoque',  label: 'Reposição de estoque',                    destinos: ['estoque'] },
  { id: 'demonstracao',       label: 'Máquina para demonstração / showroom',    destinos: ['estoque'] },
  { id: 'campanha_fabrica',   label: 'Campanha ou condição especial da fábrica', destinos: ['cliente', 'estoque'] },
  { id: 'outro',              label: 'Outro motivo',                            destinos: ['cliente', 'estoque'] },
]

export function motivosDoDestino(destino: ScDestino): ScMotivo[] {
  return SC_MOTIVOS.filter((m) => m.destinos.includes(destino))
}

export interface PayloadSC {
  produto?: string
  produto_codigo?: string
  marca?: string
  modelo?: string
  destino?: ScDestino          // ausente nas SCs antigas = 'cliente'
  confianca?: ScConfianca      // só quando destino='cliente'
  motivo?: string              // id de SC_MOTIVOS
  quantidade_solicitada?: number
  quantidade_aprovada?: number
  preco_alvo?: number          // CUSTO-alvo de COMPRA (unitário) — entra no valor total
  preco_venda_previsto?: number // preço de VENDA previsto (unitário) — só informativo
  valor_unitario?: number
  valor_total?: number
  cliente_destino?: string
  pv_numero?: string
  pedido_omie_numero?: string
  prazo_compromisso?: string // ISO date
  bloqueio?: { motivo: string; valor: number } | null
}

// ---------------------------------------------------------------------
// Abertura da SC — validação única (formulário + rota).
// ---------------------------------------------------------------------
export interface NovaSC {
  payload: PayloadSC
  descricao: string // origem imutável: "<motivo> — <complemento>"
  titulo: string
}

function texto(v: unknown, max = 160): string {
  return String(v ?? '').trim().slice(0, max)
}

// Número opcional: vazio → undefined; inválido ou negativo → NaN (vira erro).
function numeroOpcional(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

export function validarNovaSC(body: Record<string, unknown>): { erro: string } | { dados: NovaSC } {
  const produto = texto(body.produto)
  const marca = texto(body.marca, 80)
  const modelo = texto(body.modelo, 80)
  const destino: ScDestino = body.destino === 'estoque' ? 'estoque' : 'cliente'
  const qtd = Number(body.quantidade_solicitada)
  const custo = numeroOpcional(body.preco_alvo)
  const venda = numeroOpcional(body.preco_venda_previsto)
  const motivo = SC_MOTIVOS.find((m) => m.id === body.motivo)
  const complemento = texto(body.descricao, 2000)

  if (!produto) return { erro: 'Informe o produto' }
  if (!Number.isFinite(qtd) || qtd <= 0) return { erro: 'Informe a quantidade solicitada' }
  if (Number.isNaN(custo)) return { erro: 'Custo-alvo de compra inválido' }
  if (Number.isNaN(venda)) return { erro: 'Preço de venda previsto inválido' }
  if (!motivo) return { erro: 'Escolha o motivo da solicitação' }
  if (!motivo.destinos.includes(destino)) return { erro: 'Esse motivo não se aplica ao destino escolhido' }
  if (motivo.id === 'outro' && !complemento) return { erro: 'Descreva o motivo da solicitação' }

  const payload: PayloadSC = {
    produto,
    produto_codigo: texto(body.produto_codigo, 80) || undefined,
    marca: marca || undefined,
    modelo: modelo || undefined,
    destino,
    motivo: motivo.id,
    quantidade_solicitada: qtd,
    preco_alvo: custo,
    preco_venda_previsto: venda,
  }

  if (destino === 'cliente') {
    const cliente = texto(body.cliente_destino)
    const pv = texto(body.pv_numero, 40)
    const confianca = body.confianca as ScConfianca
    if (!cliente) return { erro: 'Informe o cliente destino (ou escolha "Compra para estoque")' }
    if (!SC_CONFIANCA_INFO[confianca]) return { erro: 'Informe o grau de confiança na venda' }
    if (motivo.id === 'venda_fechada' && !pv) return { erro: 'Venda fechada exige o nº do pedido de venda' }
    payload.cliente_destino = cliente
    payload.confianca = confianca
    if (pv) payload.pv_numero = pv
  }

  return {
    dados: {
      payload,
      descricao: complemento ? `${motivo.label} — ${complemento}` : motivo.label,
      titulo: `SC — ${produto}`,
    },
  }
}

// Margem prevista por unidade (venda − custo). null se faltar um dos dois.
export function margemPrevista(custo?: number | null, venda?: number | null): { valor: number; pct: number | null } | null {
  if (custo == null || venda == null || !Number.isFinite(custo) || !Number.isFinite(venda)) return null
  const valor = venda - custo
  return { valor, pct: venda > 0 ? (valor / venda) * 100 : null }
}

// ---------------------------------------------------------------------
// Lista pronta de produtos. Máquina é cadastrada POR CHASSI (uma linha por
// unidade), então o que se oferece para comprar é o MODELO, agrupado.
// ---------------------------------------------------------------------
export interface ProdutoLinha {
  codigo?: string | null
  descricao?: string | null
  marca?: string | null
  modelo?: string | null
  familia_nome?: string | null
  estoque?: number | string | null
}

export interface ModeloOpcao {
  marca: string
  modelo: string
  familia: string
  unidades: number      // linhas do cadastro com esse modelo
  em_estoque: number    // soma do estoque positivo
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

export function agruparModelos(linhas: ProdutoLinha[]): ModeloOpcao[] {
  const mapa = new Map<string, ModeloOpcao>()
  for (const l of linhas) {
    const modelo = String(l.modelo ?? '').trim()
    if (!modelo) continue
    const marca = String(l.marca ?? '').trim()
    const familia = String(l.familia_nome ?? '').trim()
    const chave = `${semAcento(marca)}|${semAcento(modelo)}|${semAcento(familia)}`
    const est = Number(l.estoque)
    const atual = mapa.get(chave) || { marca, modelo, familia, unidades: 0, em_estoque: 0 }
    atual.unidades += 1
    if (Number.isFinite(est) && est > 0) atual.em_estoque += est
    mapa.set(chave, atual)
  }
  return [...mapa.values()].sort((a, b) =>
    b.unidades - a.unidades || a.modelo.localeCompare(b.modelo, 'pt-BR', { numeric: true }))
}

export function rotuloModelo(m: Pick<ModeloOpcao, 'marca' | 'modelo' | 'familia'>): string {
  return [m.familia, m.marca, m.modelo].filter(Boolean).join(' ')
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
