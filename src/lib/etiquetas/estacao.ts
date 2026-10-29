// Estação de impressão da térmica (ROGERIA) — regras PURAS (cliente e servidor).
// Um Chrome sempre aberto no PC da impressora (/estacao-impressao) pega os
// pedidos da fila e imprime com o MESMO desenho da térmica (etiqueta-termica.ts);
// quem manda só escolhe "Na ROGERIA" em vez de "Neste computador".

import { normalizarLayout, type ItemTermica } from '@/lib/opa-pecas/etiqueta-termica'

export type OrigemEtiqueta = 'ppv' | 'opa' | 'patrimonio' | 'teste'
export type StatusTrabalho = 'pendente' | 'imprimindo' | 'impressa' | 'erro' | 'cancelada'

export const ESTACAO_ID = 'termica'
/** sem "estou viva" há mais que isso = estação desligada */
export const ESTACAO_ONLINE_MS = 90_000
/** a estação manda sinal (e procura trabalho) nesse intervalo, além do aviso ao vivo */
export const ESTACAO_SINAL_MS = 20_000
/** pedido "imprimindo" sem resposta há mais que isso = a estação caiu no meio */
export const ESTACAO_TRAVADO_MS = 5 * 60_000
export const MAX_ETIQUETAS_TRABALHO = 500
export const CANAL_ESTACAO = 'estacao-impressao'

export const ROTULO_STATUS: Record<StatusTrabalho, string> = {
  pendente: 'Na fila', imprimindo: 'Imprimindo', impressa: 'Impressa', erro: 'Erro', cancelada: 'Cancelada',
}
export const ROTULO_ORIGEM: Record<OrigemEtiqueta, string> = {
  ppv: 'Peças (PPV)', opa: 'Peças S/Estoque', patrimonio: 'Patrimônio', teste: 'Teste',
}

export interface Trabalho {
  id: number
  origem: OrigemEtiqueta
  itens: ItemTermica[]
  total: number
  status: StatusTrabalho
  erro: string | null
  criado_nome: string | null
  criado_em: string
  pego_em: string | null
  impresso_em: string | null
}

export interface SituacaoEstacao {
  nome: string
  online: boolean
  ultimoSinal: string | null
  sinalNome: string | null
  pendentes: number
  /** sql/etiquetas-estacao.sql ainda não foi rodado */
  migracaoFaltando?: boolean
}

export function estacaoOnline(ultimoSinal: string | null | undefined, agora = Date.now()): boolean {
  const t = ultimoSinal ? Date.parse(ultimoSinal) : NaN
  return Number.isFinite(t) && agora - t < ESTACAO_ONLINE_MS
}

/** "agora" · "há 3 min" · "há 2 h" · "há 4 dias" */
export function haQuanto(iso: string | null | undefined, agora = Date.now()): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return 'nunca'
  const s = Math.max(0, Math.round((agora - t) / 1000))
  if (s < 60) return 'agora'
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 48) return `há ${h} h`
  return `há ${Math.round(h / 24)} dias`
}

const texto = (v: unknown, max: number): string | undefined => {
  if (v === null || v === undefined) return undefined
  const s = String(v).replace(/[\u0000-\u001f]/g, ' ').trim()
  return s ? s.slice(0, max) : undefined
}

/** Link do QR guardado como CAMINHO do portal ("/p/<id>") — a estação põe o
 *  endereço dela na frente. Endereço de fora do portal não entra. */
export function caminhoDoLink(url: unknown): string | undefined {
  const s = texto(url, 400)
  if (!s) return undefined
  let caminho = s
  if (/^https?:\/\//i.test(s)) {
    try { caminho = new URL(s).pathname } catch { return undefined }
  }
  return /^\/[A-Za-z0-9/_\-.]{1,200}$/.test(caminho) && !caminho.includes('..') ? caminho : undefined
}

/** Confere e limpa as etiquetas que chegam do navegador (o que não é do desenho fica fora). */
export function limparItens(bruto: unknown): { itens: ItemTermica[] } | { erro: string } {
  if (!Array.isArray(bruto) || !bruto.length) return { erro: 'Nenhuma etiqueta.' }
  if (bruto.length > MAX_ETIQUETAS_TRABALHO) return { erro: `São ${bruto.length} etiquetas — o máximo por envio é ${MAX_ETIQUETAS_TRABALHO}.` }
  const itens: ItemTermica[] = []
  for (const b of bruto) {
    if (!b || typeof b !== 'object') return { erro: 'Etiqueta inválida.' }
    const o = b as Record<string, unknown>
    const codigo = texto(o.codigo, 60)
    if (!codigo) return { erro: 'Etiqueta sem código.' }
    const token = texto(o.token, 100)
    if (token && !/^[A-Za-z0-9_-]+$/.test(token)) return { erro: 'Link da etiqueta inválido.' }
    const url = caminhoDoLink(o.url)
    if (o.url && !url) return { erro: 'Link da etiqueta fora do portal.' }
    const qtd = Number(o.quantidade)
    const item: ItemTermica = { codigo, descricao: texto(o.descricao, 300) ?? null }
    if (Number.isInteger(qtd) && qtd > 0 && qtd <= 100_000) item.quantidade = qtd
    const local = texto(o.local, 200); if (local) item.local = local
    if (token) item.token = token
    if (url) item.url = url
    const topo = texto(o.topo, 80); if (topo) item.topo = topo
    const extra = texto(o.extra, 200); if (extra) item.extra = extra
    const info = texto(o.info, 200); if (info) item.info = info
    const marca = texto(o.marca, 120); if (marca) item.marca = marca
    const modelo = texto(o.modelo, 120); if (modelo) item.modelo = modelo
    const layout = normalizarLayout(o.layout); if (layout) item.layout = layout
    if (o.semQr === true) item.semQr = true
    if (o.barra === true) item.barra = true
    if (o.locGrande === true) item.locGrande = true
    if (!item.semQr && !item.token && !item.url) return { erro: 'Etiqueta com QR sem link.' }
    itens.push(item)
  }
  return { itens }
}

/** Na estação: o caminho guardado volta a ser endereço completo para o QR. */
export function comEnderecoCompleto(itens: ItemTermica[], origem: string): ItemTermica[] {
  return itens.map((i) => (i.url && i.url.startsWith('/') ? { ...i, url: origem + i.url } : i))
}
