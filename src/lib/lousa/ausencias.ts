// LANÇAMENTOS FORA DE OS NA LOUSA — regras puras (sem banco). José, 20/10/2026.
// Dia → Reunião/Folga (todos ou escolhidos). Técnico → Férias, Falta, Médico.
import { addDias } from '@/lib/salas/regras'

export type TipoAusencia = 'reuniao' | 'folga' | 'ferias' | 'falta' | 'medico'
/** dia = dia todo; manha/tarde = meio período; horas = de–até */
export type Duracao = 'dia' | 'manha' | 'tarde' | 'horas'

export interface Lancamento {
  tipo: TipoAusencia
  /** dias (YYYY-MM-DD); férias = início (os outros saem de `dias_ferias`) */
  dia: string
  diasFerias?: number
  duracao: Duracao
  horaInicio?: string | null
  horaFim?: string | null
  titulo?: string | null
  motivo?: string | null
  justificada?: boolean | null
  temAnexo?: boolean
  tecnicos: string[]
}

export const ROTULO: Record<TipoAusencia, string> = { reuniao: 'Reunião', folga: 'Folga', ferias: 'Férias', falta: 'Falta', medico: 'Médico' }
/** o que vai para o RH */
export const VAI_PARA_RH: Record<TipoAusencia, 'ponto' | 'pedido_ferias' | null> = { reuniao: null, folga: null, ferias: 'pedido_ferias', falta: 'ponto', medico: 'ponto' }

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const DIA = /^\d{4}-\d{2}-\d{2}$/
const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

/** horários de meio período (iguais aos da Lousa) */
export const MEIO_PERIODO = { manha: { ini: '08:00', fim: '12:00' }, tarde: { ini: '13:00', fim: '18:00' } } as const

/** Confere o lançamento; devolve a mensagem do primeiro problema ou null. */
export function validarLancamento(l: Lancamento): string | null {
  if (!ROTULO[l.tipo]) return 'Tipo inválido.'
  if (!DIA.test(l.dia)) return 'Escolha o dia.'
  if (!l.tecnicos.length) return 'Escolha pelo menos um técnico.'
  if (l.tipo === 'ferias') {
    const n = Number(l.diasFerias)
    if (!Number.isInteger(n) || n < 1 || n > 30) return 'Férias: de 1 a 30 dias.'
    return null
  }
  if (l.duracao === 'horas') {
    if (!HORA.test(l.horaInicio || '') || !HORA.test(l.horaFim || '')) return 'Informe de que horas a que horas.'
    if (min(l.horaFim!) <= min(l.horaInicio!)) return 'O horário final tem que ser depois do inicial.'
  }
  if (l.tipo === 'falta') {
    if (l.justificada == null) return 'Diga se a falta é justificada ou não.'
    if (l.justificada && !(l.motivo || '').trim()) return 'Falta justificada: escreva o motivo.'
  }
  if (l.tipo === 'medico' && !l.temAnexo) return 'Médico: anexe o atestado.'
  return null
}

/** dias corridos das férias, a partir do início */
export function diasDasFerias(inicio: string, n: number): string[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDias(inicio, i))
}

/** horário que o lançamento ocupa no dia */
export function horarioDe(l: Pick<Lancamento, 'duracao' | 'horaInicio' | 'horaFim'>): { ini: string; fim: string } {
  if (l.duracao === 'manha' || l.duracao === 'tarde') return { ...MEIO_PERIODO[l.duracao] }
  if (l.duracao === 'horas') return { ini: l.horaInicio!, fim: l.horaFim! }
  return { ini: '08:00', fim: '18:00' }
}

/** quantidade que o Ponto do RH espera: dia todo = 1 dia; o resto em horas (meio período = 4 h) */
export function quantidadeRH(l: Pick<Lancamento, 'duracao' | 'horaInicio' | 'horaFim'>): { quantidade: number; unidade: 'dias' | 'horas' } {
  if (l.duracao === 'dia') return { quantidade: 1, unidade: 'dias' }
  if (l.duracao === 'manha' || l.duracao === 'tarde') return { quantidade: 4, unidade: 'horas' }
  const h = (min(l.horaFim!) - min(l.horaInicio!)) / 60
  return { quantidade: Math.round(h * 100) / 100, unidade: 'horas' }
}

/** texto da observação do evento no RH (quem/quando/o quê) */
export function observacaoRH(l: Lancamento, quem: string): string {
  const h = horarioDe(l)
  const per = l.duracao === 'dia' ? 'dia todo' : `${h.ini}–${h.fim}`
  const oque = l.tipo === 'medico' ? 'Médico (atestado anexado)' : l.justificada ? 'Falta JUSTIFICADA' : 'Falta NÃO justificada'
  return `[Lousa] ${oque} · ${per}${l.motivo ? ` · motivo: ${l.motivo.trim()}` : ''} · lançado por ${quem}`
}
