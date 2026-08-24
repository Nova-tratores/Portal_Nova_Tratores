// Paleta categórica do portal — cor estável por NOME, nos dois temas.
//
// Regra que dita o desenho: a MESMA categoria tem que ter SEMPRE a mesma cor.
// Se a cor seguisse a posição no ranking, filtrar por um mês repintaria os
// sobreviventes e quem aprendeu "Combustível é laranja" seria enganado.
//
// Por que hash → ÍNDICE DE SLOT, e não hash → matiz (como faz
// dre-financeiro/composicao/page.js:73-86): hash para matiz é determinístico,
// sim, mas gera matizes arbitrários — duas categorias podem cair a 3° uma da
// outra e ficam indistinguíveis, e nada garante separação sob daltonismo.
// Indexando slots de uma paleta escolhida, toda cor sorteada já é uma cor boa.
//
// Colisão (8 slots, mais categorias que isso) resolve por varredura gulosa
// sobre TODAS as categorias ordenadas por nome — ordem canônica, independente
// de filtro e de valor. É isso que mantém o mapa estável quando um filtro entra.

export const CINZA_OUTROS = { claro: '#94a3b8', escuro: '#6b7280' }

/** 8 slots, separados em matiz e luminosidade para sobreviver a daltonismo. */
const SLOTS = {
  claro: ['#2563eb', '#ea580c', '#059669', '#7c3aed', '#0891b2', '#d97706', '#db2777', '#4d7c0f'],
  escuro: ['#60a5fa', '#fb923c', '#34d399', '#a78bfa', '#22d3ee', '#fbbf24', '#f472b6', '#a3e635'],
}

/** djb2-ish, o mesmo hash já usado no módulo DRE — muda só o que ele indexa. */
export function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

const normalizar = (nome: string) => String(nome || '').trim().toUpperCase()

/**
 * Mapa nome → índice de slot, estável para um mesmo conjunto de categorias.
 * Passe SEMPRE o conjunto completo do período (não só o que está visível),
 * senão aplicar um filtro pode remapear as cores.
 */
export function mapaDeCores(nomes: string[]): Map<string, number> {
  const unicos = [...new Set(nomes.map(normalizar))].sort()
  const mapa = new Map<string, number>()
  const ocupados = new Set<number>()
  const n = SLOTS.claro.length

  for (const nome of unicos) {
    let slot = hashStr(nome) % n
    // se o slot preferido já foi tomado, anda até achar um livre; quando todos
    // estiverem ocupados, aceita a colisão (com mais de 8 categorias visíveis
    // ela é inevitável — e aí o rótulo, que sempre acompanha a barra, desempata)
    for (let t = 0; t < n && ocupados.has(slot); t++) slot = (slot + 1) % n
    ocupados.add(slot)
    mapa.set(nome, slot)
  }
  return mapa
}

export function corDoSlot(slot: number, modo: 'claro' | 'escuro'): string {
  const cores = SLOTS[modo]
  return cores[((slot % cores.length) + cores.length) % cores.length]
}

/** Cor de uma categoria. Sem mapa, cai no hash direto (estável mesmo assim). */
export function corDaCategoria(nome: string, modo: 'claro' | 'escuro', mapa?: Map<string, number>): string {
  const chave = normalizar(nome)
  const slot = mapa?.get(chave) ?? hashStr(chave) % SLOTS.claro.length
  return corDoSlot(slot, modo)
}
