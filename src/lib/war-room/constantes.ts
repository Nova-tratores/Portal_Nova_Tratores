// War Room (Fase 1) — tipos e constantes compartilhados entre client e server.
// Roda em cima do motor de tickets: cada ação é um ticket tipo='war_room'.
// Ver docs/modulo-tickets.md e sql/create-war-room.sql.

export const MODULO_WAR_ROOM = 'war-room' as const

// --------------------------------------------------------------------------
// Fases do plano de recuperação (0 → 3).
// --------------------------------------------------------------------------
export type WarRoomFase = '0_estancar' | '1_atacar' | '2_redimensionar' | '3_governanca'

export const FASES: { id: WarRoomFase; label: string; ordem: number }[] = [
  { id: '0_estancar',      label: 'Fase 0 — Estancar',       ordem: 0 },
  { id: '1_atacar',        label: 'Fase 1 — Atacar',         ordem: 1 },
  { id: '2_redimensionar', label: 'Fase 2 — Redimensionar',  ordem: 2 },
  { id: '3_governanca',    label: 'Fase 3 — Governança',     ordem: 3 },
]

export const FASE_LABEL: Record<WarRoomFase, string> =
  Object.fromEntries(FASES.map((f) => [f.id, f.label])) as Record<WarRoomFase, string>

// --------------------------------------------------------------------------
// Nível de acesso (lista explícita de membros — NUNCA por cargo).
//   nucleo → vê tudo (caixa, ponte, definições, ata completa)
//   membro → plano de ações + sentinelas em versão reduzida (sem valores de caixa)
// --------------------------------------------------------------------------
export type WarRoomNivel = 'nucleo' | 'membro'

// --------------------------------------------------------------------------
// Ponte de caixa até dez/2026 — alvo (singleton de config como constante).
// Calibrável pela direção; mantido como constante nomeada (não número mágico).
// --------------------------------------------------------------------------
export const PONTE_ALVO_TOTAL = 2_000_000     // R$ 2,0 M a cobrir
export const PONTE_ALVO_DATA = '2026-12-31'

// --------------------------------------------------------------------------
// Farol dos sentinelas. Limiares calibráveis pela direção — constantes
// nomeadas, não números soltos espalhados pelo código.
// --------------------------------------------------------------------------
export type Farol = 'verde' | 'amarelo' | 'vermelho'

export const FAROL_INFO: Record<Farol, { label: string; cor: string; fundo: string }> = {
  verde:    { label: 'Verde',    cor: '#059669', fundo: 'rgba(5,150,105,.12)' },
  amarelo:  { label: 'Amarelo',  cor: '#d97706', fundo: 'rgba(217,119,6,.12)' },
  vermelho: { label: 'Vermelho', cor: '#dc2626', fundo: 'rgba(220,38,38,.12)' },
}

// Margem (fração da semana): verde > 0 · amarelo 0 a −5% · vermelho < −5%
export const MARGEM_AMARELO_MIN = -0.05
export function farolMargem(margem: number | null | undefined): Farol | null {
  if (margem == null) return null
  if (margem > 0) return 'verde'
  if (margem >= MARGEM_AMARELO_MIN) return 'amarelo'
  return 'vermelho'
}

// Giro (tratores vendidos/semana): verde ≥ 2 · amarelo 1 · vermelho 0.
// Também vermelho se entradas > vendidos por 4 semanas seguidas (o chamador
// passa `excessoEntradas4Semanas` calculado a partir do histórico de snapshots).
export const GIRO_VERDE_MIN = 2
export function farolGiro(
  tratoresVendidos: number | null | undefined,
  excessoEntradas4Semanas = false,
): Farol | null {
  if (tratoresVendidos == null) return null
  if (excessoEntradas4Semanas) return 'vermelho'
  if (tratoresVendidos >= GIRO_VERDE_MIN) return 'verde'
  if (tratoresVendidos === 1) return 'amarelo'
  return 'vermelho'
}

// Caixa: verde = 90d positivo SEM depender de antecipação · amarelo = positivo
// só COM antecipação · vermelho = negativo.
export function farolCaixa(
  caixa90d: number | null | undefined,
  volumeAntecipado: number | null | undefined,
): Farol | null {
  if (caixa90d == null) return null
  if (caixa90d < 0) return 'vermelho'
  const antec = volumeAntecipado ?? 0
  if (caixa90d - antec < 0) return 'amarelo'  // sem a antecipação ficaria negativo
  return 'verde'
}

const ORDEM_GRAVIDADE: Record<Farol, number> = { verde: 0, amarelo: 1, vermelho: 2 }

// Farol geral = o pior dos informados (ignora null).
export function farolGeral(...farois: (Farol | null | undefined)[]): Farol | null {
  const validos = farois.filter((f): f is Farol => f === 'verde' || f === 'amarelo' || f === 'vermelho')
  if (validos.length === 0) return null
  return validos.reduce((pior, f) => (ORDEM_GRAVIDADE[f] > ORDEM_GRAVIDADE[pior] ? f : pior))
}

// --------------------------------------------------------------------------
// Tipos das entidades (espelham as tabelas de sql/create-war-room.sql).
// --------------------------------------------------------------------------
export interface WarRoomMembro {
  user_id: string
  nivel: WarRoomNivel
  ativo: boolean
  adicionado_por: string | null
  created_at: string
}

export interface WarRoomAcao {
  id: string
  ticket_id: string
  fase: WarRoomFase
  causa_raiz: string
  entregavel: string
  indicador: string
  meta: string
  consequencia: string
  prazo_estrategico: string | null
  ordem: number
  created_at: string
}

// Linha da view v_war_room_acoes (ação + dados do ticket + dono).
export interface WarRoomAcaoView extends WarRoomAcao {
  numero: number
  titulo: string
  status: string
  dono_id: string | null
  dono_nome: string | null
  dono_avatar: string | null
  ultima_atividade_em: string
  vencida: boolean
  dias_para_prazo: number | null
}

export interface WarRoomSnapshot {
  id: string
  semana_inicio: string
  margem_semana: number | null
  tratores_vendidos: number | null
  entradas_patio: number | null
  caixa_30d: number | null
  caixa_60d: number | null
  caixa_90d: number | null
  volume_antecipado: number | null
  farol_margem: Farol | null
  farol_giro: Farol | null
  farol_caixa: Farol | null
  origem: Record<string, 'auto' | 'manual'>
  pauta_congelada: unknown | null
  pauta_congelada_lite: unknown | null
  fechado_em: string | null
  fechado_por: string | null
  created_at: string
}

export interface WarRoomDefinicao {
  id: string
  tema: string
  contexto: string
  decisao_a_extrair: string
  dados_necessarios: string
  status: 'pendente' | 'agendada' | 'decidida' | 'arquivada'
  data_alvo: string | null
  decidida_em: string | null
  criado_por: string | null
  created_at: string
}

export interface WarRoomPonteFonte {
  id: string
  nome: string
  meta: number
  realizado: number
  prazo: string | null
  acao_id: string | null
  ordem: number
  created_at: string
}

export interface WarRoomDecisao {
  id: string
  snapshot_id: string
  descricao: string
  dono_id: string | null
  prazo: string | null
  acao_id: string | null
  definicao_id: string | null
  registrado_por: string
  created_at: string
}

// Campos MANUAIS que o núcleo pode editar num snapshot aberto (o resto é auto).
export const CAMPOS_MANUAIS_SNAPSHOT = [
  'margem_semana', 'tratores_vendidos', 'entradas_patio',
  'caixa_30d', 'caixa_60d', 'caixa_90d', 'volume_antecipado',
] as const

// --------------------------------------------------------------------------
// Semana do War Room: começa na SEGUNDA, calculada em horário de BRASÍLIA
// (UTC−3, sem horário de verão desde 2019). Devolve a segunda (YYYY-MM-DD) da
// semana que contém o INSTANTE `d`.
//
// Por que BRT e não UTC: o servidor (Railway) roda em UTC. Uma venda lançada no
// domingo entre 21h e meia-noite BRT já é segunda em UTC → cairia na semana
// seguinte. Com ~1–2 tratores/semana, um lançamento na semana errada distorce o
// sentinela de giro inteiro. Calcular a borda em BRT elimina essa classe de erro.
// --------------------------------------------------------------------------
const BRT_OFFSET_MS = 3 * 3600000  // UTC−3

export function segundaDaSemana(d: Date): string {
  // Desloca o instante para o "relógio de parede" BRT e lê os campos em UTC.
  const brt = new Date(d.getTime() - BRT_OFFSET_MS)
  const dow = brt.getUTCDay()              // 0=dom, 1=seg, ... (já em BRT)
  const diff = (dow === 0 ? -6 : 1 - dow)  // recua até a segunda
  const seg = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + diff * 86400000)
  return seg.toISOString().slice(0, 10)
}
