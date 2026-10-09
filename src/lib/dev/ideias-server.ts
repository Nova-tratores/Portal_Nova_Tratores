// IDEIAS DOS DEVS — acesso ao banco (SERVIDOR, service role). Regras puras em
// ./ideias.ts. Migration: sql/dev-ideias.sql — sem ela a leitura devolve
// `migracaoFaltando` e nada mais do portal é afetado.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import type { Ideia, GrupoIdeias } from './ideias'

export { migrationFaltou }

export const MSG_MIGRATION_IDEIAS =
  'As ideias ainda não foram ativadas no banco. Rode sql/dev-ideias.sql no SQL Editor do Supabase.'

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

export const uuidValido = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function listarTudo(incluirArquivadas: boolean): Promise<{
  ideias: Ideia[]
  grupos: GrupoIdeias[]
  usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }>
}> {
  let q = supabaseAdmin.from('dev_ideias').select('*').order('created_at', { ascending: false }).limit(2000)
  if (!incluirArquivadas) q = q.eq('arquivada', false)
  const [ideias, grupos] = await Promise.all([
    q,
    supabaseAdmin.from('dev_ideias_grupos').select('*').order('updated_at', { ascending: false }).limit(1000),
  ])
  const listaIdeias = ok(ideias) as Ideia[]
  const listaGrupos = ok(grupos) as GrupoIdeias[]
  const ids = [...new Set([...listaIdeias.map((i) => i.autor_id), ...listaGrupos.map((g) => g.criado_por)])]
  const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  if (ids.length) {
    const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', ids)
    for (const u of data || []) usuarios[u.id] = u
  }
  return { ideias: listaIdeias, grupos: listaGrupos, usuarios }
}

export async function criarIdeia(autorId: string, texto: string, grupoId: string | null): Promise<Ideia> {
  return ok(await supabaseAdmin.from('dev_ideias')
    .insert({ texto, autor_id: autorId, grupo_id: grupoId })
    .select('*').single()) as Ideia
}

export async function editarIdeia(
  id: string,
  campos: Partial<Pick<Ideia, 'texto' | 'grupo_id' | 'arquivada' | 'posicao'>>,
): Promise<Ideia | null> {
  const r = await supabaseAdmin.from('dev_ideias')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id).select('*').maybeSingle()
  return ok(r) as Ideia | null
}

/** Move várias ideias para um grupo (ou para fora, com null). Devolve quantas mudaram. */
export async function moverIdeias(ids: string[], grupoId: string | null): Promise<number> {
  if (!ids.length) return 0
  const r = await supabaseAdmin.from('dev_ideias')
    .update({ grupo_id: grupoId, updated_at: new Date().toISOString() })
    .in('id', ids).select('id')
  return (ok(r) as { id: string }[]).length
}

export async function carregarGrupo(id: string): Promise<GrupoIdeias | null> {
  if (!uuidValido(id)) return null
  return ok(await supabaseAdmin.from('dev_ideias_grupos').select('*').eq('id', id).maybeSingle()) as GrupoIdeias | null
}

export async function criarGrupo(
  criadoPor: string,
  campos: { nome: string; descricao?: string | null; cor?: string | null },
): Promise<GrupoIdeias> {
  return ok(await supabaseAdmin.from('dev_ideias_grupos')
    .insert({ nome: campos.nome, descricao: campos.descricao ?? null, cor: campos.cor ?? null, criado_por: criadoPor })
    .select('*').single()) as GrupoIdeias
}

export async function editarGrupo(
  id: string,
  campos: Partial<Pick<GrupoIdeias, 'nome' | 'descricao' | 'cor' | 'ticket_id'>>,
): Promise<GrupoIdeias | null> {
  const r = await supabaseAdmin.from('dev_ideias_grupos')
    .update({ ...campos, updated_at: new Date().toISOString() })
    .eq('id', id).select('*').maybeSingle()
  return ok(r) as GrupoIdeias | null
}

/** Desfaz o grupo: as ideias voltam a soltas (FK é on delete set null). */
export async function apagarGrupo(id: string): Promise<void> {
  ok(await supabaseAdmin.from('dev_ideias_grupos').delete().eq('id', id).select('id'))
}

export async function ticketExiste(id: string): Promise<{ id: string; numero: number } | null> {
  if (!uuidValido(id)) return null
  const { data } = await supabaseAdmin.from('tickets').select('id, numero').eq('id', id).maybeSingle()
  return (data as { id: string; numero: number } | null) || null
}

/** Nº e status dos tickets dos grupos planejados (pro chip da tela). */
export async function resumoTickets(ids: string[]): Promise<Record<string, { numero: number; status: string; titulo: string }>> {
  const out: Record<string, { numero: number; status: string; titulo: string }> = {}
  if (!ids.length) return out
  const { data } = await supabaseAdmin.from('tickets').select('id, numero, status, titulo').in('id', ids)
  for (const t of (data || []) as { id: string; numero: number; status: string; titulo: string }[]) out[t.id] = t
  return out
}
