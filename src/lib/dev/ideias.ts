// IDEIAS DOS DEVS — regras puras (sem banco, sem React). Testes em __tests__/.
//
// Três estágios, derivados dos dados (não há coluna "estágio"):
//   captada   = ideia sem grupo
//   agrupada  = grupo sem ticket (a planejar)
//   planejada = grupo com ticket (virou ticket da Central de Trabalho)
import { corValida } from '@/lib/tickets/quadros'

export interface Ideia {
  id: string
  texto: string
  autor_id: string
  grupo_id: string | null
  posicao: number
  arquivada: boolean
  created_at: string
  updated_at: string
  /** Marcada para "Sugestões para a pauta" (sql/ideias-votos.sql). */
  levar_reuniao?: boolean
}

export interface GrupoIdeias {
  id: string
  nome: string
  descricao: string | null
  cor: string | null
  ticket_id: string | null
  criado_por: string
  created_at: string
  updated_at: string
}

export interface GrupoComIdeias {
  grupo: GrupoIdeias
  ideias: Ideia[]
}

export interface EstagiosIdeias {
  captadas: Ideia[]
  agrupadas: GrupoComIdeias[]
  planejadas: GrupoComIdeias[]
}

export const IDEIA_MAX = 4000
export const GRUPO_NOME_MAX = 120
export const GRUPO_DESCRICAO_MAX = 2000

type Validacao<T> = { ok: true; campos: T } | { ok: false; erro: string }

export function validarIdeia(texto: unknown): Validacao<{ texto: string }> {
  const t = String(texto ?? '').trim()
  if (!t) return { ok: false, erro: 'Escreva a ideia antes de salvar.' }
  if (t.length > IDEIA_MAX) return { ok: false, erro: `A ideia passou de ${IDEIA_MAX} caracteres.` }
  return { ok: true, campos: { texto: t } }
}

export function validarGrupo(
  body: Record<string, unknown>,
  criando: boolean,
): Validacao<{ nome?: string; descricao?: string | null; cor?: string | null }> {
  const campos: { nome?: string; descricao?: string | null; cor?: string | null } = {}
  if (criando || body.nome !== undefined) {
    const nome = String(body.nome ?? '').trim()
    if (!nome) return { ok: false, erro: 'Dê um nome ao grupo.' }
    if (nome.length > GRUPO_NOME_MAX) return { ok: false, erro: `O nome passou de ${GRUPO_NOME_MAX} caracteres.` }
    campos.nome = nome
  }
  if (body.descricao !== undefined) {
    const d = String(body.descricao ?? '').trim()
    if (d.length > GRUPO_DESCRICAO_MAX) return { ok: false, erro: `A descrição passou de ${GRUPO_DESCRICAO_MAX} caracteres.` }
    campos.descricao = d || null
  }
  if (body.cor !== undefined) {
    if (body.cor === null || body.cor === '') campos.cor = null
    else {
      const c = corValida(body.cor)
      if (!c) return { ok: false, erro: 'Cor inválida (use #RRGGBB).' }
      campos.cor = c
    }
  }
  return { ok: true, campos }
}

const ts = (iso: string) => new Date(iso).getTime() || 0

function ordenarNoGrupo(a: Ideia, b: Ideia): number {
  return a.posicao - b.posicao || ts(a.created_at) - ts(b.created_at)
}

/** Separa ideias e grupos nos 3 estágios. Ideias arquivadas ficam fora. */
export function separarPorEstagio(ideias: Ideia[], grupos: GrupoIdeias[]): EstagiosIdeias {
  const vivas = ideias.filter((i) => !i.arquivada)
  const porGrupo = new Map<string, Ideia[]>()
  const captadas: Ideia[] = []
  for (const i of vivas) {
    if (i.grupo_id) {
      const lista = porGrupo.get(i.grupo_id) || []
      lista.push(i)
      porGrupo.set(i.grupo_id, lista)
    } else captadas.push(i)
  }
  // Mais recente primeiro: a que acabou de ser escrita fica no topo.
  captadas.sort((a, b) => ts(b.created_at) - ts(a.created_at))
  const montar = (g: GrupoIdeias): GrupoComIdeias => ({
    grupo: g,
    ideias: (porGrupo.get(g.id) || []).sort(ordenarNoGrupo),
  })
  const ordemGrupo = (a: GrupoIdeias, b: GrupoIdeias) => ts(b.updated_at) - ts(a.updated_at)
  return {
    captadas,
    agrupadas: grupos.filter((g) => !g.ticket_id).sort(ordemGrupo).map(montar),
    planejadas: grupos.filter((g) => !!g.ticket_id).sort(ordemGrupo).map(montar),
  }
}

export function tituloDoGrupo(grupo: Pick<GrupoIdeias, 'nome'>): string {
  return grupo.nome.trim().slice(0, GRUPO_NOME_MAX)
}

const dataCurta = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Descrição do ticket que executa o grupo: descrição do grupo (se houver) +
 * uma linha por ideia, com quem escreveu e quando. É o que o FormTicket
 * recebe em `descricaoInicial` — o dev ainda pode mexer antes de criar.
 */
export function descricaoDoGrupo(
  grupo: Pick<GrupoIdeias, 'descricao'>,
  ideias: Pick<Ideia, 'texto' | 'autor_id' | 'created_at'>[],
  nomes: Record<string, string | undefined>,
): string {
  const partes: string[] = []
  if (grupo.descricao?.trim()) partes.push(grupo.descricao.trim())
  if (ideias.length) {
    const linhas = ideias.map((i) => {
      const quem = nomes[i.autor_id]?.split(' ')[0]
      const quando = dataCurta(i.created_at)
      const meta = [quem, quando].filter(Boolean).join(', ')
      return `- ${i.texto.trim().replace(/\s*\n\s*/g, ' ')}${meta ? ` (${meta})` : ''}`
    })
    partes.push(`Ideias agrupadas:\n${linhas.join('\n')}`)
  }
  return partes.join('\n\n')
}

// ------------------------------------------------------------ votos (melhorias 5.2)
/** Captadas: mais votadas primeiro; empate = a mais nova primeiro. */
export function ordenarPorVotos(lista: Ideia[], votos: Record<string, string[]>): Ideia[] {
  return [...lista].sort((a, b) => (votos[b.id]?.length || 0) - (votos[a.id]?.length || 0) || ts(b.created_at) - ts(a.created_at))
}

// ------------------------------------------------- parecido com pedido aberto (melhorias 5.3)
const PALAVRAS_VAZIAS = new Set(['para', 'pra', 'com', 'que', 'uma', 'umas', 'uns', 'dos', 'das', 'nos', 'nas', 'por', 'mais', 'como', 'sistema', 'fazer', 'ter', 'tem', 'ser', 'sobre', 'quando', 'onde', 'cada', 'todo', 'toda', 'todos', 'todas', 'isso', 'esse', 'essa', 'este', 'esta', 'seria', 'poder', 'pode', 'precisa', 'ideia'])
/** Palavras que contam (4+ letras, sem acento, sem as vazias; plural simples vira singular). */
export function palavrasChave(texto: string): Set<string> {
  const out = new Set<string>()
  for (const p of texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (p.length < 4 || PALAVRAS_VAZIAS.has(p)) continue
    out.add(p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p)
  }
  return out
}

/**
 * Pedidos abertos parecidos com a ideia, do mais parecido para o menos (até 3). Parecido = quantas
 * palavras do TÍTULO do pedido aparecem na ideia (2+ palavras e metade do título, no mínimo).
 * Sem IA: rápido, de graça e explica o porquê (as palavras em comum).
 */
export function parecidos<T extends { titulo: string }>(texto: string, pedidos: T[]): (T & { comuns: string[] })[] {
  const ideia = palavrasChave(texto)
  if (ideia.size < 2) return []
  const out: (T & { comuns: string[]; nota: number })[] = []
  for (const p of pedidos) {
    const tit = palavrasChave(p.titulo)
    if (tit.size < 2) continue
    const comuns = [...tit].filter((w) => ideia.has(w))
    const nota = comuns.length / tit.size
    if (comuns.length >= 2 && nota >= 0.5) out.push({ ...p, comuns, nota })
  }
  return out.sort((a, b) => b.nota - a.nota || b.comuns.length - a.comuns.length).slice(0, 3).map((x) => { const { nota, ...resto } = x; void nota; return resto as T & { comuns: string[] } })
}
