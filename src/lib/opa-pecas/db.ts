// Acesso ao banco das Peças Não Identificadas (navegador, sessão do usuário).
// Leitura: tabelas pni_* filtradas pela RLS. Escrita: SÓ pelas RPCs
// SECURITY DEFINER (sql/pni-04-rpcs.sql) — as tabelas recusam insert/update.

import { supabase } from '@/lib/supabase'
import { mensagemErro } from './fotos'
import type { Aplicacao, Decisao, Historico, Item, Local, Lookup, Qualidade, Status } from './tipos'

const SELECT_ITEM = '*, pni_fotos(id, storage_path, ordem), pni_aplicacoes(id, tipo_maquina_id, marca_id)'

interface LinhaItem extends Omit<Item, 'fotos' | 'aplicacoes' | 'preco_sugerido'> {
  preco_sugerido: number | string | null
  pni_fotos: Item['fotos'] | null
  pni_aplicacoes: Aplicacao[] | null
}

function normalizar(l: LinhaItem): Item {
  const { pni_fotos, pni_aplicacoes, ...resto } = l
  return {
    ...resto,
    preco_sugerido: l.preco_sugerido == null ? null : Number(l.preco_sugerido),
    fotos: [...(pni_fotos || [])].sort((a, b) => a.ordem - b.ordem),
    aplicacoes: pni_aplicacoes || [],
  }
}

/** Erro "tabela não existe" = migration ainda não aplicada. */
export function migracaoFaltando(e: { code?: string; message?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message || ''))
}

export const MSG_MIGRACAO = 'O banco ainda não tem as tabelas de Peças Não Identificadas (rodar sql/pni-01 a pni-04 no SQL Editor).'

export async function listarItens(filtro?: { status?: Status[] }): Promise<Item[]> {
  const todos: Item[] = []
  const PAGINA = 1000
  for (let de = 0; ; de += PAGINA) {
    let q = supabase.from('pni_itens').select(SELECT_ITEM).order('criado_em', { ascending: false }).range(de, de + PAGINA - 1)
    if (filtro?.status?.length) q = q.in('status', filtro.status)
    const { data, error } = await q
    if (error) throw new Error(migracaoFaltando(error) ? MSG_MIGRACAO : mensagemErro(error))
    todos.push(...(data as unknown as LinhaItem[]).map(normalizar))
    if (!data || data.length < PAGINA) break
  }
  return todos
}

export async function buscarItem(por: { id?: string; codigo?: string }): Promise<Item | null> {
  let q = supabase.from('pni_itens').select(SELECT_ITEM)
  q = por.id ? q.eq('id', por.id) : q.eq('codigo', por.codigo || '')
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(migracaoFaltando(error) ? MSG_MIGRACAO : mensagemErro(error))
  return data ? normalizar(data as unknown as LinhaItem) : null
}

export async function listarHistorico(itemId: string): Promise<Historico[]> {
  const { data, error } = await supabase.from('pni_historico').select('*').eq('item_id', itemId).order('em', { ascending: false })
  if (error) throw new Error(mensagemErro(error))
  return (data || []) as Historico[]
}

export async function listarLookups(): Promise<{ tipos: Lookup[]; marcas: Lookup[]; locais: Local[] }> {
  const [t, m, l] = await Promise.all([
    supabase.from('maquina_tipos').select('id, nome, ativo, ordem').order('ordem').order('nome'),
    supabase.from('maquina_marcas').select('id, nome, ativo, ordem').order('ordem').order('nome'),
    supabase.from('pni_locais').select('id, nome, exige_tecnico, ordem, ativo').order('ordem'),
  ])
  if (t.error) throw new Error(migracaoFaltando(t.error) ? MSG_MIGRACAO : mensagemErro(t.error))
  if (m.error) throw new Error(mensagemErro(m.error))
  if (l.error) throw new Error(migracaoFaltando(l.error) ? MSG_MIGRACAO_LOCAL : mensagemErro(l.error))
  return { tipos: (t.data || []) as Lookup[], marcas: (m.data || []) as Lookup[], locais: (l.data || []) as Local[] }
}

export const MSG_MIGRACAO_LOCAL = 'Falta rodar sql/pni-06-captura-completa.sql no SQL Editor (localização).'

let cacheTecnicos: string[] | null = null

/** Técnicos (mesma lista do Pós-Vendas: /api/pos/tecnicos). Falhou → lista vazia. */
export async function listarTecnicos(): Promise<string[]> {
  if (cacheTecnicos) return cacheTecnicos
  try {
    const r = await fetch('/api/pos/tecnicos')
    const j = await r.json()
    if (Array.isArray(j)) cacheTecnicos = [...new Set(j.filter((x): x is string => typeof x === 'string' && !!x.trim()))]
  } catch { /* segue vazio */ }
  return cacheTecnicos || []
}

const cacheUsuarios: Record<string, string> = {}

/** Nomes dos usuários (financeiro_usu) por id, com cache. */
export async function nomesUsuarios(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const faltam = [...new Set(ids.filter((x): x is string => !!x && !(x in cacheUsuarios)))]
  for (let i = 0; i < faltam.length; i += 200) {
    const { data } = await supabase.from('financeiro_usu').select('id, nome').in('id', faltam.slice(i, i + 200))
    for (const u of (data || []) as { id: string; nome: string | null }[]) cacheUsuarios[u.id] = u.nome || 'Usuário'
  }
  return { ...cacheUsuarios }
}

// ── RPCs ────────────────────────────────────────────────────────────

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  let r
  try {
    r = await supabase.rpc(fn, args)
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
  if (r.error) {
    const e = r.error as { code?: string; message?: string }
    if (e.code === 'PGRST202' || /could not find the function/i.test(e.message || '')) throw new Error(MSG_MIGRACAO)
    throw new Error(mensagemErro(e))
  }
  return r.data as T
}

export function criarItem(a: {
  fotos: string[]; quantidade: number; qualidade: Qualidade; descricao?: string
  local: string; localTecnico?: string; codigoFabricante?: string; preco?: number | null; aplicacoes?: Aplicacao[]
}) {
  return rpc<{ id: string; codigo: string }>('pni_criar_item', {
    p_fotos: a.fotos, p_quantidade: a.quantidade, p_qualidade: a.qualidade,
    p_descricao: a.descricao || null,   // código: sempre o automático PNI-xxxxxx
    p_local: a.local, p_local_tecnico: a.localTecnico || null,
    p_codigo_fabricante: a.codigoFabricante || null, p_preco: a.preco ?? null,
    p_aplicacoes: (a.aplicacoes || []).map((x) => ({ tipo_maquina_id: x.tipo_maquina_id, marca_id: x.marca_id })),
  })
}

export type CamposEditaveis = Partial<Pick<Item,
  'descricao' | 'codigo_fabricante' | 'quantidade' | 'qualidade' | 'preco_sugerido' | 'nao_identificavel' | 'observacoes' | 'local_id' | 'local_tecnico'>>

export function atualizarItem(id: string, dados: CamposEditaveis) {
  return rpc<Item>('pni_atualizar_item', { p_id: id, p_dados: dados })
}

export function definirAplicacoes(id: string, aplicacoes: Aplicacao[]) {
  return rpc<number>('pni_definir_aplicacoes', {
    p_id: id,
    p_aplicacoes: aplicacoes.map((a) => ({ tipo_maquina_id: a.tipo_maquina_id, marca_id: a.marca_id })),
  })
}

export function mudarStatus(id: string, para: Status, motivo?: string) {
  return rpc<{ id: string; codigo: string; status: Status }>('pni_mudar_status', { p_id: id, p_para: para, p_motivo: motivo || null })
}

export interface ResultadoLote {
  alterados: { id: string; codigo: string }[]
  erros: { id: string; codigo: string | null; erro: string }[]
}

export function mudarStatusLote(ids: string[], para: Status, motivo?: string) {
  return rpc<ResultadoLote>('pni_mudar_status_lote', { p_ids: ids, p_para: para, p_motivo: motivo || null })
}

export function excluirItem(id: string) {
  return rpc<void>('pni_excluir_item', { p_id: id })
}

export function adicionarFotos(id: string, fotos: string[]) {
  return rpc<number>('pni_adicionar_fotos', { p_id: id, p_fotos: fotos })
}

export function marcarEtiqueta(ids: string[]) {
  return rpc<number>('pni_marcar_etiqueta', { p_ids: ids })
}

export function salvarTipo(id: string | null, nome: string, ativo = true) {
  return rpc<string>('maquina_tipo_salvar', { p_id: id, p_nome: nome, p_ativo: ativo })
}

export function salvarMarca(id: string | null, nome: string, ativo = true) {
  return rpc<string>('maquina_marca_salvar', { p_id: id, p_nome: nome, p_ativo: ativo })
}

// ── Etapas ──────────────────────────────────────────────────────────

/** Etapa 2: decide o que fazer com a peça. Descartar/outro encerram na hora. */
export function separar(id: string, decisao: Decisao, obs?: string) {
  return rpc<{ id: string; codigo: string; status: Status; decisao: Decisao }>('pni_separar', { p_id: id, p_decisao: decisao, p_obs: obs || null })
}

/** Etapa 3: valor e aplicação conferidos com o setor responsável. */
export function verificar(id: string, setor: string, com?: string, obs?: string) {
  return rpc<{ id: string; codigo: string; status: Status }>('pni_verificar', { p_id: id, p_setor: setor, p_com: com || null, p_obs: obs || null })
}

/** Etapa 4: confirma o destino (o planejado ou outro) e finaliza a peça. */
export function finalizar(id: string, destino?: Decisao, obs?: string) {
  return rpc<{ id: string; codigo: string; status: Status }>('pni_finalizar', { p_id: id, p_destino: destino || null, p_obs: obs || null })
}

export interface Contagens {
  opasAbertos: number
  separacao: number
  verificacao: number
  destino: number
  emAberto: number
}

async function contar(q: PromiseLike<{ count: number | null }>): Promise<number> {
  try { return (await q).count || 0 } catch { return 0 }
}

/** Números das abas do Opa (consultas leves, só contagem). */
export async function contagens(): Promise<Contagens> {
  const pni = () => supabase.from('pni_itens').select('id', { count: 'exact', head: true })
  const [opasAbertos, separacao, verificacao, destino] = await Promise.all([
    contar(supabase.from('portal_opas').select('id', { count: 'exact', head: true }).eq('status', 'aberto')),
    contar(pni().eq('status', 'aguardando_identificacao')),
    contar(pni().eq('status', 'identificado')),
    contar(pni().in('status', ['precificado', 'a_venda'])),
  ])
  return { opasAbertos, separacao, verificacao, destino, emAberto: separacao + verificacao + destino }
}

let cacheNomesAtivos: string[] | null = null

/** Nomes dos usuários ativos do portal (sugestão de "quem confirmou"). */
export async function nomesAtivos(): Promise<string[]> {
  if (cacheNomesAtivos) return cacheNomesAtivos
  const { data } = await supabase.from('financeiro_usu').select('nome').eq('ativo', true).order('nome')
  cacheNomesAtivos = ((data || []) as { nome: string | null }[]).map((u) => u.nome).filter((n): n is string => !!n)
  return cacheNomesAtivos
}
