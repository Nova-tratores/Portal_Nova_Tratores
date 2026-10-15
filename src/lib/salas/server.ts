// AGENDA DA SALA DE REUNIÃO — banco (SERVIDOR, service role). Regras puras em ./regras.ts.
// Migration: sql/salas-reserva.sql. A sobreposição é barrada pelo próprio banco (erro 23P01).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import type { Autenticado } from '@/lib/auth/server'
import { isoDe, rotuloConflito, fimDaReuniao, type Reserva, type Sala } from './regras'

export { migrationFaltou }
export const MSG_MIGRATION_SALAS = 'A agenda da sala ainda não foi ativada no banco. Rode sql/salas-reserva.sql no SQL Editor do Supabase.'
export const uuidValido = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

export async function listarSalas(): Promise<Sala[]> {
  return ok(await supabaseAdmin.from('salas').select('*').eq('ativa', true).order('ordem').order('nome')) as Sala[]
}

/** Completa nome do responsável e nº da reunião. */
async function enriquecer(rs: Reserva[]): Promise<Reserva[]> {
  if (!rs.length) return rs
  const uids = [...new Set(rs.map((r) => r.responsavel_id))]
  const rids = [...new Set(rs.map((r) => r.reuniao_id).filter((x): x is string => !!x))]
  const [us, ts] = await Promise.all([
    supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', uids),
    rids.length ? supabaseAdmin.from('tickets').select('id, numero').in('id', rids) : Promise.resolve({ data: [] as { id: string; numero: number }[] }),
  ])
  const nome = new Map(((us.data || []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]))
  const num = new Map(((ts.data || []) as { id: string; numero: number }[]).map((t) => [t.id, t.numero]))
  return rs.map((r) => ({ ...r, responsavel_nome: nome.get(r.responsavel_id) || null, reuniao_numero: r.reuniao_id ? num.get(r.reuniao_id) ?? null : null }))
}

/** Reservas ativas que tocam o período [de 00:00, ate 24:00) de Brasília. */
export async function listarReservas(de: string, ate: string, salaId?: string | null): Promise<Reserva[]> {
  let q = supabaseAdmin.from('salas_reservas').select('*').eq('status', 'ativa')
    .lt('inicio', isoDe(ate, '23:59')).gt('fim', isoDe(de, '00:00')).order('inicio').limit(1000)
  if (salaId && uuidValido(salaId)) q = q.eq('sala_id', salaId)
  return enriquecer(ok(await q) as Reserva[])
}

export async function carregarReserva(id: string): Promise<Reserva | null> {
  if (!uuidValido(id)) return null
  const r = ok(await supabaseAdmin.from('salas_reservas').select('*').eq('id', id).maybeSingle()) as Reserva | null
  return r ? (await enriquecer([r]))[0] : null
}

/** Reserva ativa que conflita com [inicio, fim) — ou null. */
export async function conflitoEm(salaId: string, inicio: string, fim: string, ignorar?: { reservaId?: string; reuniaoId?: string }): Promise<Reserva | null> {
  let q = supabaseAdmin.from('salas_reservas').select('*').eq('sala_id', salaId).eq('status', 'ativa')
    .lt('inicio', fim).gt('fim', inicio).order('inicio').limit(1)
  if (ignorar?.reservaId) q = q.neq('id', ignorar.reservaId)
  if (ignorar?.reuniaoId) q = q.or(`reuniao_id.is.null,reuniao_id.neq.${ignorar.reuniaoId}`)
  const r = (ok(await q) as Reserva[])[0]
  return r ? (await enriquecer([r]))[0] : null
}

export type ResultadoReserva = { reserva: Reserva } | { conflito: Reserva; mensagem: string }

async function nomeDe(uid: string) {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', uid).maybeSingle()
  return (data as { nome?: string } | null)?.nome || 'Usuário'
}
async function auditar(auth: Autenticado, acao: string, r: Reserva, detalhes: Record<string, unknown> = {}) {
  await registrarAuditLog({ userId: auth.userId, userName: await nomeDe(auth.userId), sistema: 'salas', acao, entidade: 'reserva', entidadeId: r.id, entidadeLabel: r.titulo, detalhes: { inicio: r.inicio, fim: r.fim, reuniao_id: r.reuniao_id, ...detalhes } }).catch(() => {})
}

/** Tradução do 23P01 (alguém reservou no meio): devolve quem ocupa. */
async function comConflito<T>(salaId: string, inicio: string, fim: string, ignorar: { reservaId?: string; reuniaoId?: string }, fn: () => Promise<T>): Promise<T | { conflito: Reserva; mensagem: string }> {
  try { return await fn() } catch (e) {
    if ((e as { code?: string }).code !== '23P01') throw e
    const c = await conflitoEm(salaId, inicio, fim, ignorar)
    if (!c) throw Object.assign(new Error('Esse horário acabou de ser ocupado — recarregue a agenda.'), { code: 'CONFLITO' })
    return { conflito: c, mensagem: rotuloConflito(c) }
  }
}

export async function criarReserva(auth: Autenticado, n: { sala_id: string; inicio: string; fim: string; titulo: string; descricao?: string | null; reuniao_id?: string | null; responsavel_id?: string }): Promise<ResultadoReserva> {
  const r = await comConflito(n.sala_id, n.inicio, n.fim, {}, async () => ok(await supabaseAdmin.from('salas_reservas').insert({
    sala_id: n.sala_id, inicio: n.inicio, fim: n.fim, titulo: n.titulo, descricao: n.descricao || null,
    responsavel_id: n.responsavel_id || auth.userId, criado_por: auth.userId, reuniao_id: n.reuniao_id || null,
  }).select('*').single()) as Reserva)
  if ('conflito' in r) return r
  const [e] = await enriquecer([r]); await auditar(auth, 'reservar', e)
  return { reserva: e }
}

export async function editarReserva(auth: Autenticado, atual: Reserva, patch: { inicio: string; fim: string; titulo: string; descricao: string | null }): Promise<ResultadoReserva> {
  const r = await comConflito(atual.sala_id, patch.inicio, patch.fim, { reservaId: atual.id }, async () => ok(await supabaseAdmin.from('salas_reservas')
    .update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', atual.id).eq('status', 'ativa').select('*').single()) as Reserva)
  if ('conflito' in r) return r
  const [e] = await enriquecer([r]); await auditar(auth, 'editar', e, { de: { inicio: atual.inicio, fim: atual.fim, titulo: atual.titulo } })
  return { reserva: e }
}

export async function cancelarReserva(auth: Autenticado, r: Reserva, motivo?: string) {
  ok(await supabaseAdmin.from('salas_reservas').update({ status: 'cancelada', cancelada_em: new Date().toISOString(), cancelada_por: auth.userId }).eq('id', r.id).select('id'))
  await auditar(auth, 'cancelar', r, motivo ? { motivo } : {})
}

export const podeMexer = (auth: Autenticado, r: Reserva) => auth.isAdmin || r.responsavel_id === auth.userId || r.criado_por === auth.userId

// ------------------------------------------------------------ reuniões
/** Reserva ativa da reunião (se houver). Tabela ausente = null (reuniões funcionam sem sala). */
export async function reservaDaReuniao(reuniaoId: string): Promise<(Reserva & { sala_nome?: string }) | null> {
  try {
    const r = ok(await supabaseAdmin.from('salas_reservas').select('*, salas(nome)').eq('reuniao_id', reuniaoId).eq('status', 'ativa').maybeSingle()) as (Reserva & { salas?: { nome: string } | null }) | null
    return r ? { ...r, sala_nome: r.salas?.nome } : null
  } catch (e) { if (migrationFaltou(e)) return null; throw e }
}

/** Reserva a sala para uma reunião (dia + hora + duração). */
export function reservarParaReuniao(auth: Autenticado, a: { sala_id: string; reuniao_id: string; titulo: string; dia: string; hora: string; duracao_min: number; responsavel_id: string }) {
  return criarReserva(auth, {
    sala_id: a.sala_id, reuniao_id: a.reuniao_id, titulo: a.titulo, responsavel_id: a.responsavel_id,
    inicio: isoDe(a.dia, a.hora), fim: isoDe(a.dia, fimDaReuniao(a.hora, a.duracao_min)),
  })
}

/** Reunião cancelada → libera a sala. Silencioso se não há reserva/migration. */
export async function liberarSalaDaReuniao(auth: Autenticado, reuniaoId: string) {
  const r = await reservaDaReuniao(reuniaoId)
  if (r) await cancelarReserva(auth, r, 'reunião cancelada')
}
