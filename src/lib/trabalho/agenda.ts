// CENTRAL DE TRABALHO — regras PURAS da agenda (testadas).
export interface Ocupacao { ini: string; fim: string; nome: string; ticketId?: string | null }

function soma(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

/** Dias que se sobrepõem a [ini, ini+duracao-1]. */
export function conflitos(ocup: Ocupacao[], ini: string, duracao: number): Ocupacao[] {
  const fim = soma(ini, Math.max(1, duracao) - 1)
  return ocup.filter((o) => !(o.fim < ini || o.ini > fim))
}

/**
 * Primeiro dia (a partir de "desde") em que cabem `duracao` dias seguidos
 * sem nada da pessoa. Pula sábado e domingo para o início. Até 120 dias.
 */
export function proximoLivre(ocup: Ocupacao[], desde: string, duracao: number): string {
  return diasLivres(ocup, desde, duracao, 1)[0] ?? desde
}

/** Os `n` primeiros dias de início livres (dias úteis, até 120 dias à frente). */
export function diasLivres(ocup: Ocupacao[], desde: string, duracao: number, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < 120 && out.length < n; i++) {
    const d = soma(desde, i)
    const dow = new Date(d + 'T12:00:00Z').getUTCDay()
    if (dow === 0 || dow === 6) continue
    if (!conflitos(ocup, d, duracao).length) out.push(d)
  }
  return out
}

/** Sábado ou domingo? */
export function fimDeSemana(iso: string): boolean {
  const dow = new Date(iso + 'T12:00:00Z').getUTCDay()
  return dow === 0 || dow === 6
}

/** O próprio dia, ou a segunda seguinte se cair no fim de semana. */
export function diaUtil(iso: string): string {
  let d = iso
  while (fimDeSemana(d)) d = soma(d, 1)
  return d
}

/**
 * Data mínima de um pedido novo: pelo menos 1 dia de folga (amanhã).
 * Só o "muito urgente" fura a fila e pode ser para hoje.
 */
export function dataMinima(hoje: string, urgente: boolean): string {
  return urgente ? hoje : soma(hoje, 1)
}

/**
 * Calendário: o que a pessoa já tem em cada dia de [de, ate] (inclusive).
 * Só dias com algo marcado aparecem. Serve para PINTAR o dia — não bloqueia.
 */
export function diasOcupados(ocup: Ocupacao[], de: string, ate: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const o of ocup) {
    let d = o.ini < de ? de : o.ini
    const fim = o.fim > ate ? ate : o.fim
    for (let i = 0; d <= fim && i < 400; i++, d = soma(d, 1)) (out[d] ??= []).push(o.nome)
  }
  return out
}

/**
 * Ticket não fica no fim de semana: início e prazo só em dia útil.
 * `liberado` = um dia que passa mesmo sendo fim de semana (o "muito urgente"
 * para hoje). Devolve a mensagem de erro ou null.
 */
export function erroFimDeSemana(datas: { prazo?: unknown; inicio?: unknown }, liberado?: string | null): string | null {
  for (const [campo, v] of [['prazo', datas.prazo], ['início', datas.inicio]] as const) {
    const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
    if (d && d !== liberado && fimDeSemana(d)) return `O ${campo} cai num ${new Date(d + 'T12:00:00Z').getUTCDay() === 6 ? 'sábado' : 'domingo'} — ticket só em dia útil.`
  }
  return null
}
