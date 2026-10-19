// AGENDA PESSOAL — banco (SERVIDOR, service role). Regras puras em ./bloqueios.ts.
// Migration: sql/agenda-bloqueios.sql. Sem ela: indisponiveis() devolve [] (nada é barrado).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import type { Bloqueio, Indisponivel } from './bloqueios'

export { migrationFaltou }
export const MSG_MIGRATION_BLOQUEIOS = 'A agenda pessoal ainda não foi ativada no banco. Rode sql/agenda-bloqueios.sql no SQL Editor do Supabase.'

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

/** Meus bloqueios que tocam [de, ate] (com motivo — só o dono vê). */
export async function meusBloqueios(userId: string, deISO: string, ateISO: string): Promise<Bloqueio[]> {
  return ok(await supabaseAdmin.from('agenda_bloqueios').select('id, user_id, inicio, fim, motivo')
    .eq('user_id', userId).lt('inicio', ateISO).gt('fim', deISO).order('inicio').limit(500)) as Bloqueio[]
}

export async function criarBloqueio(userId: string, b: { inicio: string; fim: string; motivo: string | null }): Promise<Bloqueio> {
  return ok(await supabaseAdmin.from('agenda_bloqueios').insert({ user_id: userId, ...b }).select('id, user_id, inicio, fim, motivo').single()) as Bloqueio
}

/** Apaga só se for do próprio usuário (true = apagou). */
export async function apagarBloqueio(userId: string, id: string): Promise<boolean> {
  const rows = ok(await supabaseAdmin.from('agenda_bloqueios').delete().eq('id', id).eq('user_id', userId).select('id')) as { id: string }[]
  return rows.length > 0
}

/**
 * Quem, entre `usuarios`, está bloqueado em algum ponto de [inicio, fim).
 * Devolve SÓ quem e o nome — nunca o motivo. Tabela ausente = [] (não barra nada).
 */
export async function indisponiveis(usuarios: string[], inicioISO: string, fimISO: string): Promise<Indisponivel[]> {
  const ids = [...new Set(usuarios.filter(Boolean))]
  if (!ids.length) return []
  try {
    const rows = ok(await supabaseAdmin.from('agenda_bloqueios').select('user_id').in('user_id', ids)
      .lt('inicio', fimISO).gt('fim', inicioISO).limit(200)) as { user_id: string }[]
    const bloqueados = [...new Set(rows.map((r) => r.user_id))]
    if (!bloqueados.length) return []
    const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', bloqueados)
    const nome = new Map(((data || []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]))
    return bloqueados.map((id) => ({ usuario_id: id, nome: nome.get(id) || 'Usuário' }))
  } catch (e) {
    if (migrationFaltou(e)) return []
    throw e
  }
}
