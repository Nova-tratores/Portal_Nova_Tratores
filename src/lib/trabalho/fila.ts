// CENTRAL DE TRABALHO — FILA de cada pessoa: regras PURAS (testadas).
//
// A fila é a ORDEM em que a pessoa vai trabalhar; a agenda sai dela:
//  1. ordem = urgentes primeiro · depois a ordem manual (tickets_plano) ·
//     depois o prazo mais próximo · depois o número;
//  2. cada ticket tem DIAS de trabalho e HORAS POR DIA (payload.dias /
//     payload.horas_dia); a pessoa tem uma CAPACIDADE por dia (padrão = o
//     horário da empresa, 9 h);
//  3. o planejador percorre a fila a partir de hoje e encaixa cada ticket nos
//     dias úteis com capacidade sobrando (pula fim de semana e feriado). Dá
//     PREVISÃO de início e fim — o PRAZO (promessa a quem pediu) não muda.
//     Previsão depois do prazo = "vai atrasar".
//  4. ticket CONTÍNUO (prazo indeterminado) não termina: reserva as horas por
//     dia dele em TODO dia útil, antes dos outros, até alguém concluir.

/** Horário da empresa: 07:30–11:30 + 12:30–17:30 = 9 h (lib/assistente/horario). */
export const CAPACIDADE_PADRAO = 9

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

/** Contínuo sem horas informadas usa 1 h por dia (não trava a fila). */
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
  // 1º os contínuos: reservam a fatia diária deles no horizonte inteiro.
  for (const t of fila.filter((x) => x.continuo)) {
    const porDia = Math.max(0.5, Math.min(capacidade, t.horasDia || HORAS_CONTINUO_PADRAO))
    const desde = t.inicio && t.inicio > hoje ? t.inicio : hoje
    for (let d = desde, i = 0; i < 730; d = soma(d, 1), i++) {
      if (ehDiaUtil(d, feriados)) uso.set(d, (uso.get(d) || 0) + porDia)
    }
    out.set(t.id, { inicio: desde, fim: '', horas: porDia })
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
