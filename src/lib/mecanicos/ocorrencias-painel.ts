// Radar de Ocorrências do pós-vendas (José, 16/10/2026) — regras puras.
//
// Cada técnico começa o mês com BASE_PONTOS (100). Cada ocorrência de tecnico_ocorrencias
// desconta os pontos do catálogo, A NÃO SER que a defesa tenha sido aceita sem desconto
// (mesma regra do RH: `ocorrenciaAindaVale`). O saldo nunca fica negativo na tela.
import { rotuloOcorrencia } from '@/lib/ocorrencias/catalogo'

export const BASE_PONTOS = 100
export const CATS = ['os', 'pv', 'rh', 'frota', 'legado'] as const
export type Cat = (typeof CATS)[number]

export interface Defesa {
  id: number
  status: string // pendente | aprovada | recusada
  texto: string
  descontar: boolean | null
  avaliadoPor: string | null
  dataAvaliacao: string | null
  criadaEm: string | null
  anexos: { url: string; tipo: string; nome: string }[]
}

export interface OcorrenciaPainel {
  id: number
  tecnico: string
  data: string
  categoria: Cat
  subcategoria: string | null
  rotulo: string
  cor: string
  pontos: number
  /** ainda desconta (nenhuma defesa aceita sem desconto) */
  vale: boolean
  origem: string
  descricao: string
  idOrdem: string | null
  criadoPor: string | null
  anexos: { url: string; tipo: string; nome: string }[]
  detalhes: Record<string, unknown>
  defesas: Defesa[]
}

export interface LinhaEscudo {
  tecnico: string
  saldo: number
  descontado: number
  anulado: number
  qtd: number
  pendentes: number
  porCategoria: Record<Cat, number>
}

/** Mesma regra do RH: a ocorrência vale enquanto não há defesa aceita sem desconto. */
export function aindaVale(defesas: Pick<Defesa, 'status' | 'descontar'>[]): boolean {
  return !defesas.some((d) => d.status === 'aprovada' && d.descontar === false)
}

const catDe = (c: unknown): Cat => (CATS as readonly string[]).includes(String(c)) ? (String(c) as Cat) : 'legado'
const zeroCats = (): Record<Cat, number> => ({ os: 0, pv: 0, rh: 0, frota: 0, legado: 0 })

/** Linha crua do banco (tecnico_ocorrencias + tecnico_justificativas) → formato da tela. */
export function paraOcorrencia(o: Record<string, unknown>, padronizar: (n: unknown) => string): OcorrenciaPainel {
  const justs = (Array.isArray(o.tecnico_justificativas) ? o.tecnico_justificativas : []) as Record<string, unknown>[]
  const defesas: Defesa[] = justs.map((j) => ({
    id: Number(j.id),
    status: String(j.status ?? 'pendente'),
    texto: String(j.justificativa ?? ''),
    descontar: j.descontar_comissao == null ? null : Boolean(j.descontar_comissao),
    avaliadoPor: (j.avaliado_por as string) ?? null,
    dataAvaliacao: (j.data_avaliacao as string) ?? null,
    criadaEm: (j.created_at as string) ?? null,
    anexos: Array.isArray(j.anexos) ? (j.anexos as Defesa['anexos']) : [],
  })).sort((a, b) => (a.criadaEm || '').localeCompare(b.criadaEm || ''))
  const r = rotuloOcorrencia({ categoria: o.categoria as string, subcategoria: o.subcategoria as string, tipo: o.tipo as string })
  return {
    id: Number(o.id),
    tecnico: padronizar(o.tecnico_nome) || String(o.tecnico_nome ?? '—'),
    data: String(o.data ?? '').slice(0, 10),
    categoria: catDe(o.categoria),
    subcategoria: (o.subcategoria as string) ?? null,
    rotulo: r.label,
    cor: r.cor,
    pontos: Number(o.pontos_descontados) || 0,
    vale: aindaVale(defesas),
    origem: String(o.origem ?? 'manual'),
    descricao: String(o.descricao ?? ''),
    idOrdem: (o.id_ordem as string) ?? null,
    criadoPor: (o.criado_por as string) ?? null,
    anexos: Array.isArray(o.anexos) ? (o.anexos as OcorrenciaPainel['anexos']) : [],
    detalhes: (o.detalhes && typeof o.detalhes === 'object' ? o.detalhes : {}) as Record<string, unknown>,
    defesas,
  }
}

const palavras = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1 && !['de', 'da', 'do', 'dos', 'das'].includes(w))
const quase = (a: string, b: string) => {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false
  let i = 0, j = 0, dif = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++dif > 1) return false
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++ }
  }
  return dif + (a.length - i) + (b.length - j) <= 1
}

/**
 * Junta a grafia do lançamento com a pessoa do cadastro: mesmo primeiro nome e um sobrenome
 * igual ou com UMA letra de diferença ("DOUGRAS BOMFIM" → "Dougras Mogrs de Jesus Bonfim").
 * Cadastro de um nome só ("Lucas") casa pelo primeiro nome. Só devolve se houver UMA pessoa.
 */
export function casarNome(nome: string, cadastro: string[]): string | null {
  const w = palavras(nome)
  if (!w.length) return null
  const achados = cadastro.filter((c) => {
    const k = palavras(c)
    if (!k.length || k[0] !== w[0]) return false
    if (k.length === 1 || w.length === 1) return true
    return k.slice(1).some((a) => w.slice(1).some((b) => quase(a, b)))
  })
  return achados.length === 1 ? achados[0] : null
}

/** Nome sem sentido no lançamento ("Vazio", vazio). */
export const nomeInvalido = (n: string) => !n.trim() || /^vazio$/i.test(n.trim())

/** Escudo de cada técnico no período: todos os técnicos aparecem, mesmo sem ocorrência. */
export function escudos(ocs: OcorrenciaPainel[], tecnicos: string[]): LinhaEscudo[] {
  const m = new Map<string, LinhaEscudo>()
  const linha = (t: string) => {
    let l = m.get(t)
    if (!l) { l = { tecnico: t, saldo: BASE_PONTOS, descontado: 0, anulado: 0, qtd: 0, pendentes: 0, porCategoria: zeroCats() }; m.set(t, l) }
    return l
  }
  for (const t of tecnicos) linha(t)
  for (const o of ocs) {
    const l = linha(o.tecnico)
    l.qtd++
    if (o.defesas.some((d) => d.status === 'pendente')) l.pendentes++
    if (o.vale) { l.descontado += o.pontos; l.porCategoria[o.categoria] += o.pontos } else l.anulado += o.pontos
  }
  for (const l of m.values()) l.saldo = Math.max(0, BASE_PONTOS - l.descontado)
  return [...m.values()].sort((a, b) => a.saldo - b.saldo || b.qtd - a.qtd || a.tecnico.localeCompare(b.tecnico, 'pt-BR'))
}

export interface HistoricoPessoa {
  tecnico: string
  qtd: number[]          // ocorrências por mês (todas, inclusive anuladas)
  pontos: number[]       // pontos que valem por mês
  mediaQtdAntes: number  // média dos meses ANTERIORES ao último (o último costuma estar pela metade)
  mediaPontosAntes: number
}

/**
 * Antigas × atuais: por pessoa, mês a mês, e a média dos meses anteriores para comparar com o
 * mês escolhido (último de `meses`). Meses sem ocorrência contam como 0.
 */
export function historicoPorPessoa(ocs: OcorrenciaPainel[], meses: string[], tecnicos: string[]): HistoricoPessoa[] {
  const m = new Map<string, { qtd: number[]; pontos: number[] }>()
  const linha = (t: string) => { let x = m.get(t); if (!x) { x = { qtd: meses.map(() => 0), pontos: meses.map(() => 0) }; m.set(t, x) } return x }
  for (const t of tecnicos) linha(t)
  for (const o of ocs) {
    const i = meses.indexOf(o.data.slice(0, 7))
    if (i < 0) continue
    const x = linha(o.tecnico)
    x.qtd[i]++
    if (o.vale) x.pontos[i] += o.pontos
  }
  const antes = Math.max(1, meses.length - 1)
  const media = (a: number[]) => Math.round((a.slice(0, -1).reduce((s, v) => s + v, 0) / antes) * 10) / 10
  return [...m.entries()].map(([tecnico, x]) => ({ tecnico, ...x, mediaQtdAntes: media(x.qtd), mediaPontosAntes: media(x.pontos) }))
    .sort((a, b) => b.pontos[b.pontos.length - 1] - a.pontos[a.pontos.length - 1] || b.mediaPontosAntes - a.mediaPontosAntes || a.tecnico.localeCompare(b.tecnico, 'pt-BR'))
}

/** Motivos mais frequentes (só o que vale). */
export function motivos(ocs: OcorrenciaPainel[]): { rotulo: string; cor: string; qtd: number; pontos: number }[] {
  const m = new Map<string, { rotulo: string; cor: string; qtd: number; pontos: number }>()
  for (const o of ocs) {
    if (!o.vale) continue
    const k = `${o.categoria}|${o.rotulo}`
    const x = m.get(k) || { rotulo: o.rotulo, cor: o.cor, qtd: 0, pontos: 0 }
    x.qtd++; x.pontos += o.pontos
    m.set(k, x)
  }
  return [...m.values()].sort((a, b) => b.pontos - a.pontos || b.qtd - a.qtd)
}

/** Faixa do escudo: verde ≥ 80, amarelo ≥ 50, vermelho abaixo. */
export function faixa(saldo: number): 'ok' | 'atencao' | 'critico' {
  return saldo >= 80 ? 'ok' : saldo >= 50 ? 'atencao' : 'critico'
}

/** Mês YYYY-MM → [primeiro dia, último dia]. */
export function limitesMes(mes: string): [string, string] {
  const [a, m] = mes.split('-').map(Number)
  const fim = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return [`${mes}-01`, `${mes}-${String(fim).padStart(2, '0')}`]
}

/** Os n meses até `mes` (inclusive), do mais antigo ao mais novo. */
export function mesesAte(mes: string, n: number): string[] {
  const [a, m] = mes.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return out
}
