// Tickets — QUADROS (estilo Trello). Tipos e regras PURAS (client + server).
// Migration: sql/tickets-quadros.sql
//
// Papéis:
//  - VER o quadro: público, integrante, criador ou admin.
//  - TRABALHAR (criar ticket no quadro, mover cartão entre colunas):
//    integrante, criador ou admin. Envolvidos no ticket movem o próprio cartão.
//  - GERENCIAR (nome, cor, visibilidade, integrantes, colunas, arquivar):
//    criador ou admin.
// O status do ticket continua sendo o ciclo de vida; a coluna é organização.

export type QuadroVisibilidade = 'privado' | 'publico'

export interface Quadro {
  id: string
  nome: string
  descricao: string
  cor: string
  visibilidade: QuadroVisibilidade
  criado_por: string
  arquivado: boolean
  created_at: string
  updated_at: string
}

export interface QuadroColuna {
  id: string
  quadro_id: string
  nome: string
  posicao: number
}

export interface QuadroResumo extends Quadro {
  membros: string[]
  tickets_abertos: number
  /** Capa do bloco (listarQuadros). */
  resumo?: { andamento: number; atrasados: number; proximo: string | null }
  pode_trabalhar: boolean
  pode_gerenciar: boolean
  /** Criei ou sou integrante (o bloco é "meu"). */
  meu?: boolean
}

export const COLUNAS_PADRAO = ['A fazer', 'Fazendo', 'Feito']

export const CORES_QUADRO = [
  '#dc2626', '#ea580c', '#d97706', '#16a34a', '#0d9488',
  '#0284c7', '#4f46e5', '#7c3aed', '#db2777', '#475569',
]

export interface Ator { userId: string; isAdmin: boolean }

export function ehIntegrante(membros: string[], userId: string): boolean {
  return membros.includes(userId)
}

export function podeVerQuadro(q: Pick<Quadro, 'visibilidade' | 'criado_por'>, membros: string[], a: Ator): boolean {
  return a.isAdmin || q.visibilidade === 'publico' || q.criado_por === a.userId || ehIntegrante(membros, a.userId)
}

export function podeTrabalhar(q: Pick<Quadro, 'criado_por' | 'arquivado'>, membros: string[], a: Ator): boolean {
  if (q.arquivado) return false
  return a.isAdmin || q.criado_por === a.userId || ehIntegrante(membros, a.userId)
}

export function podeGerenciar(q: Pick<Quadro, 'criado_por'>, a: Ator): boolean {
  return a.isAdmin || q.criado_por === a.userId
}

export function limparNome(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function corValida(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : null
}

/** Valida os dados de criação/edição. Só checa o que veio. */
export function validarQuadro(
  body: Record<string, unknown>,
  criando: boolean,
): { ok: true; campos: Partial<Pick<Quadro, 'nome' | 'descricao' | 'cor' | 'visibilidade'>> } | { ok: false; erro: string } {
  const campos: Partial<Pick<Quadro, 'nome' | 'descricao' | 'cor' | 'visibilidade'>> = {}
  if (criando || 'nome' in body) {
    const nome = limparNome(body.nome, 80)
    if (!nome) return { ok: false, erro: 'Dê um nome ao quadro.' }
    campos.nome = nome
  }
  if ('descricao' in body) campos.descricao = String(body.descricao ?? '').trim().slice(0, 500)
  if ('cor' in body) {
    const cor = corValida(body.cor)
    if (!cor) return { ok: false, erro: 'Cor inválida.' }
    campos.cor = cor
  }
  if (criando || 'visibilidade' in body) {
    campos.visibilidade = body.visibilidade === 'publico' ? 'publico' : 'privado'
  }
  return { ok: true, campos }
}

/** Colunas na ordem de exibição. */
export function ordenarColunas<T extends Pick<QuadroColuna, 'posicao' | 'nome'>>(colunas: T[]): T[] {
  return [...colunas].sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Para onde vão os tickets de uma coluna removida: a coluna escolhida (se for
 * outra coluna do mesmo quadro) ou a primeira que sobrar. null = é a última.
 */
export function destinoAoRemover(colunas: QuadroColuna[], removerId: string, escolhida?: string | null): string | null {
  const restantes = ordenarColunas(colunas.filter((c) => c.id !== removerId))
  if (restantes.length === 0) return null
  if (escolhida && restantes.some((c) => c.id === escolhida)) return escolhida
  return restantes[0].id
}

/** Nova ordem válida: só aceita exatamente os mesmos ids do quadro. */
export function ordemValida(colunas: QuadroColuna[], ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null
  const atuais = new Set(colunas.map((c) => c.id))
  const novos = ids.map(String)
  if (novos.length !== atuais.size || new Set(novos).size !== novos.length) return null
  return novos.every((i) => atuais.has(i)) ? novos : null
}

/**
 * Coluna que combina com a fase: Aberto → primeira, Resolvido/Fechado →
 * última, o resto → a do meio (a 2ª). Mantém a coluna (legado "A fazer ·
 * Fazendo · Feito") em dia com o status, que é quem manda no quadro.
 */
export function colunaDoStatus(status: string, colunas: QuadroColuna[]): string | null {
  const ord = ordenarColunas(colunas)
  if (ord.length === 0) return null
  if (status === 'aberto' || status === 'cancelado') return ord[0].id
  if (status === 'resolvido' || status === 'fechado') return ord[ord.length - 1].id
  return ord[Math.min(1, ord.length - 1)].id
}

/** Coluna onde um ticket aparece: a dele, se ainda existe; senão a primeira. */
export function colunaDoTicket(colunaId: string | null | undefined, colunas: QuadroColuna[]): string | null {
  if (colunaId && colunas.some((c) => c.id === colunaId)) return colunaId
  const ord = ordenarColunas(colunas)
  return ord[0]?.id ?? null
}
