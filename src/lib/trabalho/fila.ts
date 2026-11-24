// CENTRAL DE TRABALHO — FILA de cada pessoa: regras PURAS (testadas).
//
// A fila é a ORDEM em que a pessoa vai trabalhar; a agenda sai dela:
//  1. ordem = urgentes primeiro · depois a ordem manual (tickets_plano) ·
//     depois o prazo mais próximo · depois o número;
//  2. cada ticket tem DIAS de trabalho e HORAS POR DIA (payload.dias /
//     payload.horas_dia); a pessoa tem uma CAPACIDADE por dia para a fila
//     (6 h − 1,5 h de rotina = 4,5 h; ver lib/trabalho/capacidade.ts);
//  3. o planejador percorre a fila a partir de hoje e encaixa cada ticket nos
//     dias úteis com capacidade sobrando (pula fim de semana e feriado). Dá
//     PREVISÃO de início e fim — o PRAZO (promessa a quem pediu) não muda.
//     Previsão depois do prazo = "vai atrasar".
//  4. ticket CONTÍNUO (prazo indeterminado) não termina e NÃO come a fila:
//     fica dentro da reserva de rotina (Fase 0 · I, 24/11/2026). Antes cada
//     contínuo reservava 1 h/dia para sempre.

import { CAPACIDADE_FILA } from './capacidade'

/** Horas por dia que a fila usa (6 h − 1,5 h de rotina). Era 9 h, o horário cheio da empresa. */
export const CAPACIDADE_PADRAO = CAPACIDADE_FILA

export interface ItemFila {
  id: string
  numero: number
  prazo: string | null
  urgente: boolean
  dias: number
  horasDia: number
  /** Prazo indeterminado: ocupa horasDia todo dia útil a partir de `inicio`. */
  continuo?: boolean
  inicio?: string
}

/** Horas/dia exibidas no contínuo sem horas informadas (só informativo: a fila não desconta). */
export const HORAS_CONTINUO_PADRAO = 1

/** fim = '' no contínuo (vai até concluir). */
export interface Previsao { inicio: string; fim: string; horas: number }

const soma = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const fimDeSemana = (iso: string) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6 }

/** Dia útil = não é sábado/domingo nem feriado. */
export function ehDiaUtil(iso: string, feriados: Set<string>): boolean {
  return !fimDeSemana(iso) && !feriados.has(iso)
}

/** Dias úteis de ini até fim (inclusive); no mínimo 1. */
export function diasUteisEntre(ini: string, fim: string, feriados: Set<string>): number {
  let n = 0
  for (let d = ini, i = 0; d <= fim && i < 400; d = soma(d, 1), i++) if (ehDiaUtil(d, feriados)) n++
  return Math.max(1, n)
}

/** Diferença em dias corridos (b - a). */
export function difDias(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
}

/**
 * Ordem da fila. `posicao` = ordem manual (tickets_plano); quem não tem
 * posição vai depois dos posicionados, pelo prazo. Urgente sempre no topo.
 */
export function ordenarFila<T extends { id: string; numero: number; prazo: string | null; urgente: boolean }>(
  itens: T[], posicao: Map<string, number>,
): T[] {
  const pos = (t: T) => posicao.get(t.id) ?? Number.POSITIVE_INFINITY
  return [...itens].sort((a, b) =>
    Number(b.urgente) - Number(a.urgente)
    || pos(a) - pos(b)
    || (a.prazo || '9999-99-99').localeCompare(b.prazo || '9999-99-99')
    || a.numero - b.numero)
}

/**
 * Encaixa a fila (já na ordem) na agenda da pessoa. Cada ticket usa até
 * `horasDia` por dia, sem passar da `capacidade` do dia; o que sobra no dia
 * fica para o próximo da fila ("cabe dois no mesmo dia se couber").
 */
export function planejarFila(
  fila: ItemFila[], hoje: string, feriados: Set<string>, capacidade = CAPACIDADE_PADRAO,
): Map<string, Previsao> {
  const uso = new Map<string, number>()
  const out = new Map<string, Previsao>()
  // Contínuos: ficam na reserva de rotina, não descontam da capacidade da fila.
  for (const t of fila.filter((x) => x.continuo)) {
    const desde = t.inicio && t.inicio > hoje ? t.inicio : hoje
    out.set(t.id, { inicio: desde, fim: '', horas: 0 })
  }
  for (const t of fila) {
    if (t.continuo) continue
    const porDia = Math.max(0.5, Math.min(capacidade, t.horasDia || capacidade))
    let restante = Math.max(1, t.dias || 1) * porDia
    const total = restante
    let inicio: string | null = null
    let fim = hoje
    for (let d = hoje, i = 0; restante > 0.001 && i < 730; d = soma(d, 1), i++) {
      if (!ehDiaUtil(d, feriados)) continue
      const livre = capacidade - (uso.get(d) || 0)
      if (livre <= 0.001) continue
      const h = Math.min(porDia, livre, restante)
      uso.set(d, (uso.get(d) || 0) + h)
      restante -= h
      if (!inicio) inicio = d
      fim = d
    }
    out.set(t.id, { inicio: inicio || hoje, fim, horas: total })
  }
  return out
}

/** Quantos dias a previsão passa do prazo (0 = dentro do prazo ou sem prazo). */
export function atrasoPrevisto(prazo: string | null, previsao: Previsao | undefined): number {
  if (!prazo || !previsao || previsao.fim <= prazo) return 0
  return difDias(prazo, previsao.fim)
}

/** Campos do ticket que a fila usa (payload.dias / horas_dia / inicio / urgente). */
export interface TicketDaFila { id: string; numero: number; prazo: string | null; payload?: unknown }

/**
 * Ticket → item da fila. Uma regra só para a tela da Fila, a Minha fila, a carga da
 * Equipe e o lembrete do dia (24/11/2026). Sem horas informadas usa o dia cheio da
 * fila e marca semEstimativa (aparece "estimar"); sem prazo = contínuo (na rotina).
 */
export function itemDoTicket(t: TicketDaFila, capacidade: number, feriados: Set<string>): ItemFila & { semEstimativa: boolean } {
  const p = (t.payload || {}) as { dias?: number; horas_dia?: number; inicio?: string; urgente?: boolean }
  const dias = p.dias || (p.inicio && t.prazo && p.inicio <= t.prazo ? diasUteisEntre(p.inicio, t.prazo, feriados) : 1)
  const continuo = !t.prazo
  return {
    id: t.id, numero: t.numero, prazo: t.prazo, urgente: p.urgente === true, dias, continuo, inicio: p.inicio,
    horasDia: p.horas_dia || (continuo ? HORAS_CONTINUO_PADRAO : capacidade),
    semEstimativa: !continuo && !p.horas_dia,
  }
}

/** Sexta-feira da semana de `hoje` (YYYY-MM-DD). Sábado/domingo: a sexta seguinte. */
export function sextaDaSemana(hoje: string): string {
  const w = new Date(hoje + 'T12:00:00Z').getUTCDay()
  return soma(hoje, w === 6 ? 6 : w === 0 ? 5 : 5 - w)
}
