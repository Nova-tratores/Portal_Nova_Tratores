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
