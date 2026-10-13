// Patrimônio Loja — sugestão de preço pela internet: regras PURAS (testadas).
// O servidor (preco-server.ts) pergunta à OpenAI com busca na web e devolve
// anúncios de NOVO e de USADO; aqui: ler a resposta, limpar, resumir (menor,
// mediana, maior) e sugerir um valor pelo ESTADO do item. É só sugestão —
// a pessoa confere os links e decide ("Usar este valor").

import type { Estado } from './tipos'

export interface Anuncio { preco: number; titulo: string; url: string }
export interface Faixa { min: number; mediana: number; max: number; n: number }
export interface ResultadoPreco {
  consulta: string
  novo: Anuncio[]
  usado: Anuncio[]
  observacao: string | null
  buscadoEm: string
}

/** O que vai na busca: descrição + marca + modelo (+ categoria se faltar marca/modelo). */
export function montarConsulta(d: { descricao: string; marca?: string; modelo?: string; categoria?: string }): string {
  const partes = [d.descricao, d.marca, d.modelo].map((s) => (s || '').trim()).filter(Boolean)
  if (!d.marca?.trim() && !d.modelo?.trim() && d.categoria?.trim()) partes.push(`(${d.categoria.trim()})`)
  // sem repetir palavra (descrição "Cadeira Cavaletti" + marca "Cavaletti")
  const vistas = new Set<string>()
  return partes.join(' ').split(/\s+/).filter((p) => { const k = p.toLowerCase(); if (vistas.has(k)) return false; vistas.add(k); return true }).join(' ').slice(0, 200)
}

/** Já dá para buscar? Descrição com 4+ letras e mais alguma pista. */
export function podeBuscar(d: { descricao: string; marca?: string; modelo?: string; categoria?: string }): boolean {
  return d.descricao.trim().length >= 4 && !!(d.marca?.trim() || d.modelo?.trim() || d.categoria?.trim())
}

function limparAnuncios(v: unknown): Anuncio[] {
  if (!Array.isArray(v)) return []
  const out: Anuncio[] = []
  for (const a of v) {
    const preco = Number(String((a as { preco?: unknown })?.preco ?? '').replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
    const url = String((a as { url?: unknown })?.url ?? '').trim()
    if (!Number.isFinite(preco) || preco <= 0 || preco > 10_000_000 || !/^https?:\/\//i.test(url)) continue
    out.push({ preco: Math.round(preco * 100) / 100, titulo: String((a as { titulo?: unknown })?.titulo ?? '').trim().slice(0, 160), url: url.slice(0, 500) })
  }
  return out.slice(0, 8)
}

/** Lê o texto do modelo (JSON, às vezes dentro de ```json). Lança se não der. */
export function lerRespostaPreco(texto: string, consulta: string, agora = new Date()): ResultadoPreco {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('A busca não devolveu preços.')
  const j = JSON.parse(m[0]) as { novo?: unknown; usado?: unknown; observacao?: unknown }
  return {
    consulta, novo: limparAnuncios(j.novo), usado: limparAnuncios(j.usado),
    observacao: typeof j.observacao === 'string' && j.observacao.trim() ? j.observacao.trim().slice(0, 300) : null,
    buscadoEm: agora.toISOString(),
  }
}

export function faixa(lista: Anuncio[]): Faixa | null {
  if (!lista.length) return null
  const p = lista.map((a) => a.preco).sort((a, b) => a - b)
  const meio = Math.floor(p.length / 2)
  const mediana = p.length % 2 ? p[meio] : (p[meio - 1] + p[meio]) / 2
  return { min: p[0], mediana: Math.round(mediana * 100) / 100, max: p[p.length - 1], n: p.length }
}

/** Fator sobre o USADO (quando há) e, sem usado, sobre o NOVO. */
const FATOR: Record<Estado, { usado: number; novo: number }> = {
  novo: { usado: 1.3, novo: 1 },
  bom: { usado: 1, novo: 0.7 },
  regular: { usado: 0.75, novo: 0.5 },
  ruim: { usado: 0.4, novo: 0.25 },
  sem_uso: { usado: 0.1, novo: 0.05 },
}

/** Valor sugerido pelo estado (arredondado de 5 em 5 reais; até R$ 50 de 1 em 1). */
export function sugerirValor(r: Pick<ResultadoPreco, 'novo' | 'usado'>, estado: Estado): { valor: number; base: 'novo' | 'usado' } | null {
  const fn = faixa(r.novo)
  const fu = faixa(r.usado)
  let bruto: number
  let base: 'novo' | 'usado'
  if (estado === 'novo' && fn) { bruto = fn.mediana; base = 'novo' }          // novo: o preço de novo manda
  else if (fu) { bruto = fu.mediana * FATOR[estado].usado; base = 'usado' }   // usado: o preço de usado manda
  else if (fn) { bruto = fn.mediana * FATOR[estado].novo; base = 'novo' }     // sem usado: desconta do novo
  else return null
  const passo = bruto <= 50 ? 1 : 5
  return { valor: Math.max(passo, Math.round(bruto / passo) * passo), base }
}
