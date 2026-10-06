/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// CENTRAL DE TRABALHO — Cronograma ↔ Tickets (SERVIDOR, service role).
// Migration: sql/central-trabalho.sql (projetos.quadro_id, tarefas.ticket_id).
//
//  * Recálculo do projeto (o MESMO motor da rota /api/cronograma/recalcular);
//    projeto ligado a quadro recalcula com "hoje" = replanejamento automático.
//  * Iniciar etapa  → cria ticket no quadro do projeto (prazo = fim previsto).
//  * Planejar ticket → cria etapa no projeto do quadro do ticket.
//  * Ticket mudou de status → etapa acompanha (andamento / concluída / volta).
// Sem a migration, tudo aqui devolve "não disponível" e os Tickets seguem.
// =============================================================================
import { cronogramaAdmin } from '@/lib/cronograma/supabase-server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { calcular } from '@/lib/cronograma/motor'
import type { Calendario, DepIn, EntradaMotor, Recurso, TarefaIn } from '@/lib/cronograma/motor'
import type { Ticket } from '@/lib/tickets/constantes'
import { STATUS_FINAIS } from '@/lib/tickets/constantes'

const cron = () => cronogramaAdmin().schema('cronograma')

/** Data de hoje em São Paulo, AAAA-MM-DD. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function ok<T>(res: { data: T | null; error: any }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

// ── Recálculo ────────────────────────────────────────────────────────────────
export async function recalcularProjeto(projetoId: string): Promise<{ ok: boolean; saida?: ReturnType<typeof calcular>; error?: string; ciclo?: boolean }> {
  const db = cron()
  const [projetoRes, tarefasRes, depsRes, recursosRes, calsRes, excRes] = await Promise.all([
    db.from('projetos').select('*').eq('id', projetoId).single(),
    db.from('tarefas').select('id, duracao_dias, restricao, restricao_data, recurso_id, parent_id, tipo, inicio_real, fim_real, status').eq('projeto_id', projetoId),
    db.from('dependencias').select('predecessora_id, sucessora_id, tipo, lag_dias').eq('projeto_id', projetoId),
    db.from('recursos').select('id, calendario_id'),
    db.from('calendarios').select('id, dias_semana'),
    db.from('calendario_excecoes').select('calendario_id, data, tipo'),
  ])
  const erroDb = projetoRes.error || tarefasRes.error || depsRes.error || recursosRes.error || calsRes.error || excRes.error
  if (erroDb) return { ok: false, error: erroDb.message }
  if (!projetoRes.data) return { ok: false, error: 'Projeto não encontrado' }

  const excPorCal = new Map<string, Calendario['excecoes']>()
  for (const e of excRes.data ?? []) {
    const arr = excPorCal.get(e.calendario_id) ?? []
    arr.push({ data: e.data, tipo: e.tipo })
    excPorCal.set(e.calendario_id, arr)
  }
  const calendarios: Calendario[] = (calsRes.data ?? []).map((c: any) => ({ id: c.id, diasSemana: (c.dias_semana ?? []) as number[], excecoes: excPorCal.get(c.id) ?? [] }))
  const recursos: Recurso[] = (recursosRes.data ?? []).filter((r: any) => r.calendario_id).map((r: any) => ({ id: r.id, calendarioId: r.calendario_id }))
  const tarefas: TarefaIn[] = (tarefasRes.data ?? []).map((t: any) => ({
    id: t.id, duracaoDias: Number(t.duracao_dias), restricao: t.restricao, restricaoData: t.restricao_data ?? undefined,
    recursoId: t.recurso_id ?? undefined, parentId: t.parent_id ?? null, tipo: t.tipo,
    inicioReal: t.inicio_real ?? undefined, fimReal: t.fim_real ?? undefined, status: t.status,
  }))
  const dependencias: DepIn[] = (depsRes.data ?? []).map((d: any) => ({ predecessoraId: d.predecessora_id, sucessoraId: d.sucessora_id, tipo: d.tipo, lagDias: Number(d.lag_dias) }))
  const projeto: any = projetoRes.data
  const entrada: EntradaMotor = {
    inicioProjeto: projeto.data_inicio, calendarioPadraoId: projeto.calendario_id ?? '',
    tarefas, dependencias, recursos, calendarios,
    // replanejamento automático só para projeto ligado a quadro de tickets
    ...(projeto.quadro_id ? { hoje: hojeSP() } : {}),
  }
  const saida = calcular(entrada)
  if (saida.erros.some((e) => e.tipo === 'ciclo')) return { ok: false, saida, ciclo: true }
  const { error } = await db.rpc('cron_aplicar_recalculo', {
    p_projeto_id: projetoId,
    p_tarefas: saida.tarefas.map((t) => ({ id: t.id, inicio_calc: t.inicioCalc, fim_calc: t.fimCalc, folga_dias: t.folgaDias, e_critica: t.eCritica })),
    p_fim_projeto: saida.fimProjeto,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, saida }
}

/** Recalcula todos os projetos ativos ligados a quadro (rotina diária). */
export async function recalcularProjetosLigados(): Promise<number> {
  const { data } = await cron().from('projetos').select('id').not('quadro_id', 'is', null).eq('status', 'ativo')
  let n = 0
  for (const p of data ?? []) { const r = await recalcularProjeto(p.id); if (r.ok) n++ }
  return n
}

// ── Recurso da pessoa (para a etapa contar na agenda dela) ──────────────────
export async function garantirRecurso(userId: string): Promise<string | null> {
  const db = cron()
  const { data: existe } = await db.from('recursos').select('id').eq('ref_externa', userId).eq('ativo', true).maybeSingle()
  if (existe) return existe.id
  const { data: u } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  const { data: novo, error } = await db.from('recursos')
    .insert({ nome: u?.nome || 'Usuário', tipo: 'pessoa', ref_externa: userId, ativo: true }).select('id').single()
  if (error) return null
  return novo.id
}

// ── Ticket ↔ etapa ───────────────────────────────────────────────────────────
export interface EtapaResumo {
  tarefa_id: string
  projeto_id: string
  projeto_nome: string
  nome: string
  inicio: string | null
  fim: string | null
  critica: boolean
  status: string
}

export async function etapasDosTickets(ticketIds: string[]): Promise<Record<string, EtapaResumo>> {
  if (!ticketIds.length) return {}
  try {
    const db = cron()
    const tarefas = ok(await db.from('tarefas').select('id, projeto_id, nome, inicio_calc, fim_calc, e_critica, status, ticket_id').in('ticket_id', ticketIds)) as any[]
    if (!tarefas.length) return {}
    const projetos = ok(await db.from('projetos').select('id, nome').in('id', [...new Set(tarefas.map((t) => t.projeto_id))])) as any[]
    const nomes = new Map(projetos.map((p) => [p.id, p.nome]))
    const out: Record<string, EtapaResumo> = {}
    for (const t of tarefas) {
      out[t.ticket_id] = { tarefa_id: t.id, projeto_id: t.projeto_id, projeto_nome: nomes.get(t.projeto_id) || '', nome: t.nome, inicio: t.inicio_calc, fim: t.fim_calc, critica: !!t.e_critica, status: t.status }
    }
    return out
  } catch {
    return {} // migration pendente: sem cronograma ligado
  }
}

/** Projeto do cronograma ligado ao quadro (ou null). */
export async function projetoDoQuadro(quadroId: string): Promise<{ id: string; nome: string } | null> {
  try {
    const { data } = await cron().from('projetos').select('id, nome').eq('quadro_id', quadroId).neq('status', 'cancelado').limit(1).maybeSingle()
    return data ?? null
  } catch { return null }
}

/**
 * Ticket mudou de status → etapa ligada acompanha:
 *  aberto/andamento/aguardando → em andamento (com data real de início)
 *  resolvido/fechado            → concluída (data real de fim = hoje)
 *  cancelado                    → volta a pendente e solta o ticket
 */
export async function sincronizarEtapaDoTicket(ticket: Pick<Ticket, 'id' | 'status'>): Promise<void> {
  try {
    const db = cron()
    const { data: tarefa } = await db.from('tarefas').select('id, projeto_id, status, inicio_real').eq('ticket_id', ticket.id).maybeSingle()
    if (!tarefa) return
    const hoje = hojeSP()
    let patch: Record<string, unknown>
    if (ticket.status === 'cancelado') patch = { status: 'pendente', inicio_real: null, fim_real: null, progresso: 0, ticket_id: null }
    else if (ticket.status === 'resolvido' || ticket.status === 'fechado') patch = { status: 'concluida', inicio_real: tarefa.inicio_real || hoje, fim_real: hoje, progresso: 100 }
    else patch = { status: 'em_andamento', inicio_real: tarefa.inicio_real || hoje, fim_real: null, progresso: tarefa.status === 'concluida' ? 50 : undefined }
    for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k]
    const mesmo = tarefa.status === patch.status && !('ticket_id' in patch)
    if (mesmo) return
    await db.from('tarefas').update(patch).eq('id', tarefa.id)
    await recalcularProjeto(tarefa.projeto_id)
  } catch (e) {
    console.error('[trabalho] sincronizar etapa', e)
  }
}

/** Quem recebeu propôs outra data: a etapa ainda não iniciada passa a começar nela. */
export async function moverEtapaDoTicket(ticketId: string, data: string): Promise<void> {
  try {
    const db = cron()
    const { data: t } = await db.from('tarefas').select('id, projeto_id, status').eq('ticket_id', ticketId).maybeSingle()
    if (!t || t.status !== 'pendente') return
    await db.from('tarefas').update({ restricao: 'iniciar_nao_antes', restricao_data: data }).eq('id', t.id)
    await recalcularProjeto(t.projeto_id)
  } catch (e) { console.error('[trabalho] mover etapa', e) }
}

/** Primeira coluna do quadro (onde nasce o ticket). */
async function colunaInicial(quadroId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('tickets_quadro_colunas').select('id').eq('quadro_id', quadroId).order('posicao').limit(1).maybeSingle()
  return data?.id ?? null
}

export class ErroTrabalho extends Error {
  constructor(msg: string, public status = 400) { super(msg); this.name = 'ErroTrabalho' }
}

/**
 * "Iniciar" uma etapa: cria o ticket no quadro ligado ao projeto, com prazo
 * no fim previsto e o responsável escolhido (padrão: pessoa do recurso).
 */
export async function iniciarEtapa(tarefaId: string, solicitanteId: string, responsavelId?: string | null): Promise<{ ticket: Ticket }> {
  const db = cron()
  const { data: tarefa, error } = await db.from('tarefas').select('*').eq('id', tarefaId).maybeSingle()
  if (error) throw new ErroTrabalho('A ligação com os Tickets ainda não foi ativada no banco (rode sql/central-trabalho.sql).', 503)
  if (!tarefa) throw new ErroTrabalho('Etapa não encontrada', 404)
  if (tarefa.ticket_id) throw new ErroTrabalho('Esta etapa já tem ticket.')
  if (tarefa.status === 'concluida') throw new ErroTrabalho('Esta etapa já foi concluída.')
  const { data: projeto } = await db.from('projetos').select('id, nome, quadro_id').eq('id', tarefa.projeto_id).single()
  if (!projeto?.quadro_id) throw new ErroTrabalho('Ligue este projeto a um quadro de tickets antes de iniciar etapas.')

  let resp = responsavelId || null
  if (!resp && tarefa.recurso_id) {
    const { data: rec } = await db.from('recursos').select('ref_externa').eq('id', tarefa.recurso_id).maybeSingle()
    resp = rec?.ref_externa || null
  }
  resp = resp || solicitanteId

  const { data: ticket, error: eTk } = await supabaseAdmin.from('tickets').insert({
    titulo: tarefa.nome,
    descricao: (tarefa.descricao ? tarefa.descricao + '\n\n' : '') + `Etapa do cronograma "${projeto.nome}", iniciada pela Central de Trabalho.`,
    prazo: tarefa.fim_calc || null,
    solicitante_id: solicitanteId,
    responsavel_id: resp,
    quadro_id: projeto.quadro_id,
    quadro_coluna_id: await colunaInicial(projeto.quadro_id),
    status: 'em_andamento',
    aceite: resp === solicitanteId ? 'ok' : 'pendente',
  }).select('*').single()
  if (eTk || !ticket) throw new ErroTrabalho(eTk?.message || 'Falha ao criar o ticket', 500)

  await db.from('tarefas').update({ ticket_id: ticket.id, status: 'em_andamento', inicio_real: hojeSP() }).eq('id', tarefaId)
  await recalcularProjeto(tarefa.projeto_id)
  return { ticket: ticket as Ticket }
}

/** "Planejar no cronograma": cria a etapa ligada ao ticket no projeto do quadro dele. */
export async function planejarTicket(ticket: Ticket, opts: { duracao: number; inicio?: string | null }): Promise<{ tarefaId: string }> {
  if (!ticket.quadro_id) throw new ErroTrabalho('Coloque o ticket num quadro ligado a um cronograma.')
  const projeto = await projetoDoQuadro(ticket.quadro_id)
  if (!projeto) throw new ErroTrabalho('O quadro deste ticket ainda não tem cronograma ligado. Ligue um projeto ao quadro no Cronograma.')
  const db = cron()
  const { data: ja } = await db.from('tarefas').select('id').eq('ticket_id', ticket.id).maybeSingle()
  if (ja) throw new ErroTrabalho('Este ticket já está no cronograma.')
  const recurso = await garantirRecurso(ticket.responsavel_id)
  const andando = !STATUS_FINAIS.includes(ticket.status) && ticket.status !== 'aberto'
  const { data: nova, error } = await db.from('tarefas').insert({
    projeto_id: projeto.id,
    nome: ticket.titulo,
    duracao_dias: Math.max(1, Math.min(365, Math.round(opts.duracao || 1))),
    restricao: opts.inicio ? 'iniciar_nao_antes' : 'asap',
    restricao_data: opts.inicio || null,
    recurso_id: recurso,
    ticket_id: ticket.id,
    status: andando ? 'em_andamento' : 'pendente',
    inicio_real: andando ? hojeSP() : null,
    ordem: 9999,
  }).select('id').single()
  if (error || !nova) throw new ErroTrabalho(error?.message || 'Falha ao planejar', 500)
  await recalcularProjeto(projeto.id)
  return { tarefaId: nova.id }
}

/** Liga um projeto a um quadro existente ou cria um quadro com o nome do projeto. */
export async function ligarProjetoAoQuadro(projetoId: string, quadroId: string | null, criarPor?: string): Promise<{ quadroId: string | null }> {
  const db = cron()
  const { data: projeto, error } = await db.from('projetos').select('id, nome, quadro_id').eq('id', projetoId).maybeSingle()
  if (error) throw new ErroTrabalho('A ligação com os Tickets ainda não foi ativada no banco (rode sql/central-trabalho.sql).', 503)
  if (!projeto) throw new ErroTrabalho('Projeto não encontrado', 404)
  let destino = quadroId
  if (!destino && criarPor) {
    const { data: q, error: eq } = await supabaseAdmin.from('tickets_quadros')
      .insert({ nome: projeto.nome.slice(0, 80), visibilidade: 'privado', criado_por: criarPor }).select('id').single()
    if (eq || !q) throw new ErroTrabalho(eq?.message || 'Falha ao criar o quadro', 500)
    await supabaseAdmin.from('tickets_quadro_membros').insert({ quadro_id: q.id, user_id: criarPor, adicionado_por: criarPor })
    await supabaseAdmin.from('tickets_quadro_colunas').insert(['A fazer', 'Fazendo', 'Feito'].map((nome, posicao) => ({ quadro_id: q.id, nome, posicao })))
    destino = q.id
  }
  await db.from('projetos').update({ quadro_id: destino }).eq('id', projetoId)
  await recalcularProjeto(projetoId)
  return { quadroId: destino }
}
