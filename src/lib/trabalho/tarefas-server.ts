/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// CENTRAL DE TRABALHO — Tarefas ↔ Tickets (SERVIDOR, service role).
// Migration: sql/central-trabalho.sql (portal_tarefas.ticket_id + papel_no_ticket).
//
//  * "passo": tarefa que mora dentro do ticket (checklist com responsável e
//    prazo). Aparece também na lista de Tarefas de quem foi atribuído.
//  * "origem": a tarefa solta que virou o ticket (Transformar).
// =============================================================================
import { supabaseAdmin } from '@/lib/server/supabase-admin'

const TBL = 'portal_tarefas'

export interface PassoTicket {
  id: number
  titulo: string
  prazo: string | null
  concluida: boolean
  atribuido_a: string | null
  criado_por: string | null
  created_at: string
}

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

export async function passosDoTicket(ticketId: string): Promise<PassoTicket[]> {
  try {
    return ok(await supabaseAdmin.from(TBL)
      .select('id, titulo, prazo, concluida, atribuido_a, criado_por, created_at')
      .eq('ticket_id', ticketId).eq('papel_no_ticket', 'passo')
      .order('created_at')) as PassoTicket[]
  } catch { return [] }
}

/** {ticketId: {feitas, total}} — para o selo "1/3 tarefas" do cartão. */
export async function contagemPassos(ticketIds: string[]): Promise<Record<string, { feitas: number; total: number }>> {
  if (!ticketIds.length) return {}
  try {
    const rows = ok(await supabaseAdmin.from(TBL).select('ticket_id, concluida')
      .in('ticket_id', ticketIds).eq('papel_no_ticket', 'passo')) as { ticket_id: string; concluida: boolean }[]
    const out: Record<string, { feitas: number; total: number }> = {}
    for (const r of rows) {
      const c = (out[r.ticket_id] ||= { feitas: 0, total: 0 })
      c.total++; if (r.concluida) c.feitas++
    }
    return out
  } catch { return {} }
}

export async function criarPasso(ticketId: string, autorId: string, d: { titulo: string; atribuido_a?: string | null; prazo?: string | null }) {
  const titulo = String(d.titulo || '').trim().slice(0, 200)
  if (!titulo) throw Object.assign(new Error('Escreva a tarefa.'), { status: 400 })
  return ok(await supabaseAdmin.from(TBL).insert({
    titulo, descricao: '', prioridade: 0, criado_por: autorId,
    atribuido_a: d.atribuido_a || autorId,
    prazo: d.prazo ? new Date(d.prazo + 'T12:00:00').toISOString() : null,
    ticket_id: ticketId, papel_no_ticket: 'passo',
  }).select('id, titulo, prazo, concluida, atribuido_a, criado_por, created_at').single()) as PassoTicket
}

export async function marcarPasso(ticketId: string, passoId: number, feita: boolean) {
  return ok(await supabaseAdmin.from(TBL).update({
    concluida: feita, concluida_em: feita ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  }).eq('id', passoId).eq('ticket_id', ticketId).select('id, titulo, concluida').single()) as { id: number; titulo: string; concluida: boolean }
}

export async function removerPasso(ticketId: string, passoId: number) {
  const row = ok(await supabaseAdmin.from(TBL).select('id, titulo').eq('id', passoId).eq('ticket_id', ticketId).maybeSingle()) as { id: number; titulo: string } | null
  if (!row) throw Object.assign(new Error('Tarefa não encontrada'), { status: 404 })
  ok(await supabaseAdmin.from(TBL).delete().eq('id', passoId))
  return row
}

export async function carregarTarefa(id: number) {
  return ok(await supabaseAdmin.from(TBL).select('*').eq('id', id).maybeSingle()) as any
}

/** Edita título, quem faz e prazo de um passo. Devolve antes/depois (para aviso e timeline). */
export async function editarPasso(ticketId: string, passoId: number, d: { titulo?: string; atribuido_a?: string | null; prazo?: string | null }) {
  const antes = ok(await supabaseAdmin.from(TBL).select('id, titulo, prazo, atribuido_a')
    .eq('id', passoId).eq('ticket_id', ticketId).maybeSingle()) as { id: number; titulo: string; prazo: string | null; atribuido_a: string | null } | null
  if (!antes) throw Object.assign(new Error('Tarefa não encontrada'), { status: 404 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (d.titulo !== undefined) {
    const titulo = String(d.titulo || '').trim().slice(0, 200)
    if (!titulo) throw Object.assign(new Error('A tarefa precisa de um texto.'), { status: 400 })
    patch.titulo = titulo
  }
  if (d.atribuido_a !== undefined && d.atribuido_a) patch.atribuido_a = d.atribuido_a
  if (d.prazo !== undefined) patch.prazo = d.prazo ? new Date(d.prazo + 'T12:00:00').toISOString() : null
  const depois = ok(await supabaseAdmin.from(TBL).update(patch).eq('id', passoId).eq('ticket_id', ticketId)
    .select('id, titulo, prazo, concluida, atribuido_a, criado_por, created_at').single()) as PassoTicket
  return { antes, depois }
}
