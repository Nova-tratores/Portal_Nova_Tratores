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
  for (let i = 0; i < 120; i++) {
    const d = soma(desde, i)
    const dow = new Date(d + 'T12:00:00Z').getUTCDay()
    if (dow === 0 || dow === 6) continue
    if (!conflitos(ocup, d, duracao).length) return d
  }
  return desde
}
