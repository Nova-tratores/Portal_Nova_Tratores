// PAINÉIS (melhorias 6, 25/11/2026) — contas puras, sem banco. Testes em __tests__/painel.test.ts.

const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** Dia (AAAA-MM-DD) em São Paulo de um instante ISO. */
export const diaSPde = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ts))
/** Segunda-feira da semana do dia. */
export function segundaDe(dia: string): string {
  const w = new Date(dia + 'T12:00:00Z').getUTCDay()
  return somaDias(dia, w === 0 ? -6 : 1 - w)
}

export interface SemanaFluxo { segunda: string; entrou: number; saiu: number }

/** Entrou × saiu nas últimas n semanas (a atual por último). Datas = dias AAAA-MM-DD. */
export function entrouSaiuPorSemana(entradas: string[], saidas: string[], hoje: string, n = 8): SemanaFluxo[] {
  const atual = segundaDe(hoje)
  const semanas = Array.from({ length: n }, (_, k) => somaDias(atual, -7 * (n - 1 - k)))
  const idx = new Map(semanas.map((s, k) => [s, k]))
  const out = semanas.map((segunda) => ({ segunda, entrou: 0, saiu: 0 }))
  for (const d of entradas) { const k = idx.get(segundaDe(d)); if (k !== undefined) out[k].entrou++ }
  for (const d of saidas) { const k = idx.get(segundaDe(d)); if (k !== undefined) out[k].saiu++ }
  return out
}

/** % de prazos cumpridos: concluído no dia do prazo ou antes. null = nada com prazo concluído. */
export function prazosCumpridos(lista: { prazo: string; concluido: string }[]): { pct: number | null; cumpridos: number; total: number } {
  const total = lista.length
  const cumpridos = lista.filter((x) => x.concluido <= x.prazo).length
  return { pct: total ? Math.round((cumpridos / total) * 100) : null, cumpridos, total }
}

/** Média de dias (inteira) entre a criação e hoje. */
export function idadeMedia(criados: string[], hoje: string): number {
  if (!criados.length) return 0
  const h = Date.parse(hoje + 'T12:00:00Z')
  return Math.round(criados.reduce((s, d) => s + (h - Date.parse(d + 'T12:00:00Z')) / 86400000, 0) / criados.length)
}

// ------------------------------------------------------------ resumo de fim de dia (6.1)
export interface ResumoDia { fechou: number; passou: number; chegaram: number; proximo: { numero: number; titulo: string } | null }

/** "Hoje você fechou 3, passou 1 bola, chegaram 2." + "Amanhã começa por #308 …". null = nada a dizer. */
export function textoResumoDia(r: ResumoDia): { titulo: string; descricao: string } | null {
  const fiz: string[] = []
  if (r.fechou) fiz.push(`fechou ${r.fechou}`)
  if (r.passou) fiz.push(`passou ${r.passou} ${r.passou === 1 ? 'bola' : 'bolas'}`)
  const chegou = r.chegaram ? (r.chegaram === 1 ? 'chegou 1 pedido novo' : `chegaram ${r.chegaram} pedidos novos`) : ''
  if (!fiz.length && !chegou && !r.proximo) return null
  const titulo = fiz.length ? `Hoje você ${fiz.join(' e ')}${chegou ? `; ${chegou}` : ''}.`
    : chegou ? `Hoje ${chegou}.` : 'Seu dia na Central'
  const descricao = r.proximo ? `Amanhã começa por #${r.proximo.numero} ${r.proximo.titulo}`.slice(0, 200) : 'Sua fila está vazia para amanhã.'
  return { titulo, descricao }
}
