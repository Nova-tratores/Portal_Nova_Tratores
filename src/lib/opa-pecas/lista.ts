// Modo LISTA do Opa (Ocorrências e Peças S/Estoque): ordenação A→Z / Z→A e
// filtro por coluna no CABEÇALHO, estilo planilha (marca os valores que quer
// ver). Puro: sem React, sem banco — a tela só desenha.

export const VAZIO = '(vazio)'

export interface ColunaLista<T> {
  chave: string
  /** valor para ORDENAR (número ordena como número; null/'' vai pro fim) */
  ordem: (t: T) => string | number | null
  /** valores para o FILTRO (vários = a linha casa se QUALQUER um estiver marcado, ex.: etiquetas) */
  valores?: (t: T) => string[]
}

/** chave da coluna → valores marcados (coluna ausente = sem filtro) */
export type FiltrosColuna = Record<string, string[]>
export interface OrdemLista { chave: string; asc: boolean }

const COLLATOR = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/** Valores da coluna para o filtro de uma linha ('' vira "(vazio)"). */
export function valoresDaLinha<T>(c: ColunaLista<T>, t: T): string[] {
  const brutos = c.valores ? c.valores(t) : [String(c.ordem(t) ?? '')]
  const limpos = brutos.map((v) => (v ?? '').trim()).filter(Boolean)
  return limpos.length ? limpos : [VAZIO]
}

export function filtrarLista<T>(linhas: T[], colunas: ColunaLista<T>[], filtros: FiltrosColuna): T[] {
  const ativos = colunas.filter((c) => filtros[c.chave]?.length)
  if (!ativos.length) return linhas
  return linhas.filter((t) => ativos.every((c) => {
    const marcados = filtros[c.chave]
    return valoresDaLinha(c, t).some((v) => marcados.includes(v))
  }))
}

export function compararValores(a: string | number | null, b: string | number | null): number {
  const va = a == null || a === '', vb = b == null || b === ''
  if (va && vb) return 0
  if (va) return 1 // vazio sempre no fim, nos dois sentidos
  if (vb) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return COLLATOR.compare(String(a), String(b))
}

export function ordenarLista<T>(linhas: T[], colunas: ColunaLista<T>[], ordem: OrdemLista | null): T[] {
  const c = ordem && colunas.find((x) => x.chave === ordem.chave)
  if (!c || !ordem) return linhas
  return linhas
    .map((t, i) => ({ t, i, v: c.ordem(t) }))
    .sort((x, y) => {
      const vx = x.v, vy = y.v
      const vazioX = vx == null || vx === '', vazioY = vy == null || vy === ''
      if (vazioX || vazioY) return compararValores(vx, vy) || x.i - y.i
      const r = compararValores(vx, vy)
      return (ordem.asc ? r : -r) || x.i - y.i
    })
    .map((x) => x.t)
}

/**
 * Valores distintos de uma coluna com a contagem, considerando os filtros das
 * OUTRAS colunas (igual à planilha: a lista do filtro mostra o que sobra).
 */
export function opcoesDaColuna<T>(linhas: T[], colunas: ColunaLista<T>[], filtros: FiltrosColuna, chave: string): { valor: string; n: number }[] {
  const c = colunas.find((x) => x.chave === chave)
  if (!c) return []
  const outros = { ...filtros }
  delete outros[chave]
  const cont = new Map<string, number>()
  for (const t of filtrarLista(linhas, colunas, outros)) {
    for (const v of new Set(valoresDaLinha(c, t))) cont.set(v, (cont.get(v) || 0) + 1)
  }
  return [...cont.entries()]
    .map(([valor, n]) => ({ valor, n }))
    .sort((a, b) => (a.valor === VAZIO ? 1 : b.valor === VAZIO ? -1 : COLLATOR.compare(a.valor, b.valor)))
}

/** Remove dos filtros as colunas sem nenhum valor marcado. */
export function limparFiltros(f: FiltrosColuna): FiltrosColuna {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => Array.isArray(v) && v.length > 0))
}

export type ModoVisao = 'cards' | 'lista'
