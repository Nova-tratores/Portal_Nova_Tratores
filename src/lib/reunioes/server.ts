// REUNIÕES — acesso ao banco e efeitos (SERVIDOR, service role).
// Regras puras em ./regras.ts. Migration: sql/reunioes.sql.
// Toda escrita passa pelas rotas /api/reunioes/*; o navegador só lê (RLS).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import type { Autenticado } from '@/lib/auth/server'
import {
  carregarTicket, podeVerTicket, garantirParticipante, registrarEvento, notificarTicket, camposDoStatus,
} from '@/lib/tickets/server'
import { STATUS_FINAIS, type Ticket, type TicketParticipante, type TicketStatus } from '@/lib/tickets/constantes'
import { hojeSP, moverEtapaDoTicket, sincronizarEtapaDoTicket } from '@/lib/trabalho/cronograma-server'
import { diaSP } from '@/lib/trabalho/agenda-server'
import {
  ETAPA_INFO, ETAPAS_ENCERRADAS, classificarPendencias, etapaEfetiva, sugestoesProximaReuniao, secretarioDaVez,
  proximaDataDaSerie, inicioISO, textoWhatsApp, tituloReuniao, addDias,
  type ReuniaoEtapa, type Serie, type ItemPauta, type Presenca, type PapelReuniao, type BlocoPendencias, type AcaoDeReuniao,
} from './regras'

export { migrationFaltou }
export const MSG_MIGRATION_REUNIOES =
  'As reuniões ainda não foram ativadas no banco. Rode sql/reunioes.sql no SQL Editor do Supabase.'

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}
export const uuidValido = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)
const agoraISO = () => new Date().toISOString()

export interface PresencaRow extends Presenca { reuniao_id: string; marcado_em: string | null }
export interface AtaRow { reuniao_id: string; publicada_em: string; publicada_por: string; snapshot: Record<string, unknown>; texto_whatsapp: string }

export interface ReuniaoCarregada {
  ticket: Ticket
  participantes: TicketParticipante[]
  serie: Serie | null
  itens: ItemPauta[]
  presencas: PresencaRow[]
  ata: AtaRow | null
  /** Etapa calculada na leitura (C11): agendada + corte passado = pauta_fechada. */
  etapaEfetiva: ReuniaoEtapa
}

// ------------------------------------------------------------------ séries
export async function carregarSerie(id: string): Promise<Serie | null> {
  if (!uuidValido(id)) return null
  return ok(await supabaseAdmin.from('reunioes_series').select('*').eq('id', id).maybeSingle()) as Serie | null
}

export function podeVerSerie(s: Serie, auth: Autenticado): boolean {
  return auth.isAdmin || s.condutor_id === auth.userId || s.participantes_padrao.includes(auth.userId)
    || s.secretarios_rodizio.includes(auth.userId) || s.visibilidade === 'publico'
}
export function podeGerirSerie(s: Serie, auth: Autenticado): boolean {
  return auth.isAdmin || s.condutor_id === auth.userId
}

export async function listarSeries(auth: Autenticado, incluirInativas: boolean): Promise<Serie[]> {
  let q = supabaseAdmin.from('reunioes_series').select('*').order('nome')
  if (!incluirInativas) q = q.eq('ativa', true)
  return (ok(await q) as Serie[]).filter((s) => podeVerSerie(s, auth))
}

export async function criarSerie(auth: Autenticado, campos: Partial<Serie>): Promise<Serie> {
  return ok(await supabaseAdmin.from('reunioes_series').insert({
    nome: campos.nome, condutor_id: campos.condutor_id,
    secretarios_rodizio: campos.secretarios_rodizio ?? [], participantes_padrao: campos.participantes_padrao ?? [],
    recorrencia: campos.recorrencia ?? 'nenhuma', dia_semana: campos.dia_semana ?? null, hora: campos.hora ?? null,
    duracao_min: campos.duracao_min ?? 30, corte_antecedencia_horas: campos.corte_antecedencia_horas ?? 18,
    visibilidade: campos.visibilidade ?? 'publico', criado_por: auth.userId,
  }).select('*').single()) as Serie
}

export async function editarSerie(id: string, campos: Partial<Serie>): Promise<Serie> {
  return ok(await supabaseAdmin.from('reunioes_series').update({ ...campos, atualizado_em: agoraISO() }).eq('id', id).select('*').single()) as Serie
}

// --------------------------------------------------------------- reuniões
export async function carregarReuniao(id: string): Promise<ReuniaoCarregada | null> {
  if (!uuidValido(id)) return null
  const base = await carregarTicket(id)
  if (!base || base.ticket.tipo !== 'reuniao') return null
  const [itens, presencas, ata, serie] = await Promise.all([
    supabaseAdmin.from('reunioes_itens').select('*').eq('reuniao_id', id).order('ordem').order('criado_em'),
    supabaseAdmin.from('reunioes_presencas').select('*').eq('reuniao_id', id),
    supabaseAdmin.from('reunioes_ata').select('*').eq('reuniao_id', id).maybeSingle(),
    base.ticket.reuniao_serie_id ? carregarSerie(base.ticket.reuniao_serie_id) : Promise.resolve(null),
  ])
  const s = serie as Serie | null
  return {
    ticket: base.ticket, participantes: base.participantes, serie: s,
    itens: ok(itens) as ItemPauta[], presencas: ok(presencas) as PresencaRow[], ata: ok(ata) as AtaRow | null,
    etapaEfetiva: etapaEfetiva(base.ticket.reuniao_etapa as ReuniaoEtapa, base.ticket.reuniao_inicio ?? null, s?.corte_antecedencia_horas ?? 18, new Date()),
  }
}

export const podeVerReuniao = (r: ReuniaoCarregada, auth: Autenticado) => podeVerTicket(r.ticket, r.participantes, auth)

export function papelNaReuniao(r: ReuniaoCarregada, userId: string): PapelReuniao | null {
  return r.presencas.find((p) => p.usuario_id === userId)?.papel ?? null
}
export function ehParticipanteDaReuniao(r: ReuniaoCarregada, userId: string): boolean {
  return !!papelNaReuniao(r, userId) || r.participantes.some((p) => p.user_id === userId && !p.removido_em)
}

export function condutorDe(r: ReuniaoCarregada): string {
  return r.presencas.find((p) => p.papel === 'condutor')?.usuario_id || r.ticket.solicitante_id
}
export function secretarioDe(r: ReuniaoCarregada): string | null {
  return r.presencas.find((p) => p.papel === 'secretario')?.usuario_id || null
}

async function nomes(ids: string[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return {}
  const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', unicos)
  const out: Record<string, string> = {}
  for (const u of data || []) out[u.id] = u.nome
  return out
}
export async function usuariosMin(ids: string[]) {
  const unicos = [...new Set(ids.filter(Boolean))]
  const out: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  if (!unicos.length) return out
  const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', unicos)
  for (const u of data || []) out[u.id] = u
  return out
}

/** Última reunião da série (por início) antes de `antesDe`, excluindo canceladas. */
export async function reuniaoAnteriorDaSerie(serieId: string, antesDe: string, excetoId?: string): Promise<Ticket | null> {
  let q = supabaseAdmin.from('tickets').select('*').eq('tipo', 'reuniao').eq('reuniao_serie_id', serieId)
    .neq('reuniao_etapa', 'cancelada').lt('reuniao_inicio', antesDe).order('reuniao_inicio', { ascending: false }).limit(1)
  if (excetoId) q = q.neq('id', excetoId)
  const rows = ok(await q) as Ticket[]
  return rows[0] || null
}
/** Próxima reunião da série depois de `depoisDe` (não encerrada). */
export async function proximaReuniaoDaSerie(serieId: string, depoisDe: string, excetoId?: string): Promise<Ticket | null> {
  let q = supabaseAdmin.from('tickets').select('*').eq('tipo', 'reuniao').eq('reuniao_serie_id', serieId)
    .not('reuniao_etapa', 'in', `(${ETAPAS_ENCERRADAS.join(',')})`).gt('reuniao_inicio', depoisDe).order('reuniao_inicio').limit(1)
  if (excetoId) q = q.neq('id', excetoId)
  const rows = ok(await q) as Ticket[]
  return rows[0] || null
}

export interface NovaReuniao {
  serie?: Serie | null
  dia: string            // YYYY-MM-DD
  hora: string           // HH:MM
  titulo?: string | null
  descricao?: string | null
  condutor_id?: string | null
  secretario_id?: string | null
  participantes?: string[]
  visibilidade?: 'privado' | 'publico'
  duracao_min?: number | null
}

/**
 * Cria a reunião: ticket tipo='reuniao' (etapa agendada, status aberto,
 * prazo = dia, reuniao_inicio = dia+hora), presenças com papéis, participantes
 * do ticket (dá a visibilidade via RLS) SEM aceite pendente, e puxa as
 * sugestões (parking/adiado) da reunião anterior da série.
 */
export async function criarReuniao(auth: Autenticado, n: NovaReuniao): Promise<ReuniaoCarregada> {
  const serie = n.serie || null
  const condutor = n.condutor_id || serie?.condutor_id || auth.userId
  let secretario = n.secretario_id ?? (serie ? secretarioDaVez(serie) : null)
  if (secretario === condutor) secretario = secretario // R9: avisa na UI, não bloqueia
  const participantes = [...new Set([condutor, ...(secretario ? [secretario] : []), ...(n.participantes || []), ...(serie?.participantes_padrao || [])])]
  const inicio = inicioISO(n.dia, n.hora)
  const titulo = tituloReuniao(serie?.nome || null, n.dia, n.titulo)
  const payload: Record<string, unknown> = { duracao_min: n.duracao_min ?? serie?.duracao_min ?? 30 }

  const ticket = ok(await supabaseAdmin.from('tickets').insert({
    tipo: 'reuniao', reuniao_etapa: 'agendada', status: ETAPA_INFO.agendada.status,
    titulo, descricao: (n.descricao || '').trim() || `Reunião${serie ? ` da série "${serie.nome}"` : ''} em ${n.dia.split('-').reverse().join('/')} às ${n.hora}.`,
    categoria: 'Reunião', prazo: n.dia, reuniao_inicio: inicio, reuniao_serie_id: serie?.id ?? null,
    visibilidade: n.visibilidade || serie?.visibilidade || 'publico',
    solicitante_id: condutor, responsavel_id: condutor, aceite: 'ok', payload,
  }).select('*').single()) as Ticket

  for (const u of participantes) await garantirParticipante(ticket.id, u, auth.userId)
  await supabaseAdmin.from('reunioes_presencas').insert(participantes.map((u) => ({
    reuniao_id: ticket.id, usuario_id: u,
    papel: u === condutor ? 'condutor' : u === secretario ? 'secretario' : 'participante',
  })))
  if (serie) await supabaseAdmin.from('reunioes_series').update({ instancias_geradas: serie.instancias_geradas + 1 }).eq('id', serie.id)
  await registrarEvento(ticket.id, auth.userId, 'criacao', { titulo, reuniao: true, inicio, condutor, secretario, participantes })

  // Sugestões da reunião anterior da série (R13 + adiados).
  if (serie) await puxarSugestoes(ticket, serie, auth.userId)

  await notificarTicket(ticket, participantes, auth.userId, `Reunião marcada: ${titulo}`, `${n.dia.split('-').reverse().join('/')} às ${n.hora}. Inclua os itens da pauta até o corte.`)
  return (await carregarReuniao(ticket.id))!
}

/** Copia para esta reunião os itens parking/adiado da anterior que ainda não foram copiados (idempotente). */
export async function puxarSugestoes(reuniao: Ticket, serie: Serie, autorId: string): Promise<number> {
  const anterior = await reuniaoAnteriorDaSerie(serie.id, reuniao.reuniao_inicio!, reuniao.id)
  if (!anterior) return 0
  const [itensAnt, jaCopiados] = await Promise.all([
    supabaseAdmin.from('reunioes_itens').select('*').eq('reuniao_id', anterior.id),
    supabaseAdmin.from('reunioes_itens').select('item_origem_id').eq('reuniao_id', reuniao.id).not('item_origem_id', 'is', null),
  ])
  const copiados = new Set((ok(jaCopiados) as { item_origem_id: string }[]).map((x) => x.item_origem_id))
  const sugestoes = sugestoesProximaReuniao(ok(itensAnt) as ItemPauta[]).filter((s) => !copiados.has(s.item_origem_id))
  if (!sugestoes.length) return 0
  const { data: maxRow } = await supabaseAdmin.from('reunioes_itens').select('ordem').eq('reuniao_id', reuniao.id).order('ordem', { ascending: false }).limit(1)
  let ordem = (maxRow?.[0]?.ordem ?? -1) + 1
  ok(await supabaseAdmin.from('reunioes_itens').insert(sugestoes.map((s) => ({ ...s, reuniao_id: reuniao.id, ordem: ordem++, criado_por: autorId }))).select('id'))
  await registrarEvento(reuniao.id, autorId, 'edicao', { campo: 'pauta', sugestoes: sugestoes.length, de_reuniao: anterior.id })
  return sugestoes.length
}

/** Garante a próxima instância da série depois de `depoisDe` (cria se não existir). */
export async function garantirProximaInstancia(auth: Autenticado, serie: Serie, depoisDe: string): Promise<Ticket | null> {
  const existente = await proximaReuniaoDaSerie(serie.id, depoisDe)
  if (existente) return existente
  if (serie.recorrencia === 'nenhuma' || !serie.hora) return null
  const dia = proximaDataDaSerie(serie, diaSP(depoisDe))
  if (!dia) return null
  const s = (await carregarSerie(serie.id)) || serie
  const r = await criarReuniao(auth, { serie: s, dia, hora: s.hora! })
  return r.ticket
}

// ------------------------------------------------------------------ listas
export type VisaoReunioes = 'proximas' | 'historico' | 'minhas'

export async function listarReunioes(auth: Autenticado, visao: VisaoReunioes, serieId?: string | null) {
  let q = supabaseAdmin.from('tickets').select('*').eq('tipo', 'reuniao').limit(300)
  if (visao === 'historico') q = q.in('reuniao_etapa', ETAPAS_ENCERRADAS).order('reuniao_inicio', { ascending: false })
  else q = q.not('reuniao_etapa', 'in', `(${ETAPAS_ENCERRADAS.join(',')})`).order('reuniao_inicio')
  if (serieId && uuidValido(serieId)) q = q.eq('reuniao_serie_id', serieId)
  const tickets = ok(await q) as Ticket[]
  if (!tickets.length) return { reunioes: [] as Ticket[], presencas: {} as Record<string, PresencaRow[]>, itens: {} as Record<string, number> }
  const ids = tickets.map((t) => t.id)
  const [parts, pres, itens] = await Promise.all([
    supabaseAdmin.from('tickets_participantes').select('*').in('ticket_id', ids),
    supabaseAdmin.from('reunioes_presencas').select('*').in('reuniao_id', ids),
    supabaseAdmin.from('reunioes_itens').select('reuniao_id').in('reuniao_id', ids),
  ])
  const porTicket = new Map<string, TicketParticipante[]>()
  for (const p of (ok(parts) as TicketParticipante[])) porTicket.set(p.ticket_id, [...(porTicket.get(p.ticket_id) || []), p])
  const presPor: Record<string, PresencaRow[]> = {}
  for (const p of (ok(pres) as PresencaRow[])) (presPor[p.reuniao_id] ||= []).push(p)
  const nItens: Record<string, number> = {}
  for (const i of (ok(itens) as { reuniao_id: string }[])) nItens[i.reuniao_id] = (nItens[i.reuniao_id] || 0) + 1
  const visiveis: Ticket[] = []
  for (const t of tickets) {
    if (visao === 'minhas' && !(presPor[t.id] || []).some((p) => p.usuario_id === auth.userId)) continue
    if (await podeVerTicket(t, porTicket.get(t.id) || [], auth)) visiveis.push(t)
  }
  return { reunioes: visiveis, presencas: presPor, itens: nItens }
}

// -------------------------------------------------------------- pendências
/** Ações nascidas nas reuniões da série (ou, se avulsa, nas reuniões avulsas do mesmo condutor). */
export async function acoesDaSerieOuCondutor(r: ReuniaoCarregada): Promise<AcaoDeReuniao[]> {
  let reunioesIds: string[]
  if (r.serie) {
    const rows = ok(await supabaseAdmin.from('tickets').select('id').eq('tipo', 'reuniao').eq('reuniao_serie_id', r.serie.id)) as { id: string }[]
    reunioesIds = rows.map((x) => x.id)
  } else {
    const condutor = condutorDe(r)
    const rows = ok(await supabaseAdmin.from('tickets').select('id').eq('tipo', 'reuniao').is('reuniao_serie_id', null).eq('solicitante_id', condutor)) as { id: string }[]
    reunioesIds = rows.map((x) => x.id)
  }
  if (!reunioesIds.length) return []
  const rows = ok(await supabaseAdmin.from('tickets')
    .select('id, numero, titulo, status, prazo, responsavel_id, origem_reuniao_id, prazo_reprogramacoes, resolvido_em, fechado_em, aceite')
    .in('origem_reuniao_id', reunioesIds).limit(1000)) as AcaoDeReuniao[]
  return rows
}

export async function blocoPendencias(r: ReuniaoCarregada): Promise<BlocoPendencias & { limite: string; desde: string | null }> {
  const acoes = await acoesDaSerieOuCondutor(r)
  const diaReuniao = r.ticket.prazo || hojeSP()
  const hoje = hojeSP()
  const ref = hoje > diaReuniao ? hoje : diaReuniao
  let limite: string | null = null
  let desde: string | null = null
  if (r.serie) {
    const prox = await proximaReuniaoDaSerie(r.serie.id, r.ticket.reuniao_inicio!, r.ticket.id)
    limite = prox?.prazo || (r.serie.recorrencia !== 'nenhuma' ? proximaDataDaSerie(r.serie, diaReuniao) : null)
    const ant = await reuniaoAnteriorDaSerie(r.serie.id, r.ticket.reuniao_inicio!, r.ticket.id)
    desde = ant?.reuniao_inicio || null
  }
  const bloco = classificarPendencias(acoes, { hoje: ref, limiteVencendo: limite, desde })
  return { ...bloco, limite: limite || addDias(ref, 7), desde }
}

// --------------------------------------------------------------- mutações
export async function mudarEtapa(auth: Autenticado, r: ReuniaoCarregada, para: ReuniaoEtapa, motivo?: string) {
  const de = r.ticket.reuniao_etapa as ReuniaoEtapa
  const patch: Record<string, unknown> = { reuniao_etapa: para, status: ETAPA_INFO[para].status, ...camposDoStatus(ETAPA_INFO[para].status) }
  const { data: gravou } = await supabaseAdmin.from('tickets').update(patch).eq('id', r.ticket.id).eq('reuniao_etapa', de).select('id')
  if (!gravou?.length) throw Object.assign(new Error('Alguém mudou esta reunião agora — recarregue.'), { code: 'CONFLITO' })
  if (STATUS_FINAIS.includes(ETAPA_INFO[para].status as TicketStatus)) await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', r.ticket.id)
  await registrarEvento(r.ticket.id, auth.userId, 'reuniao_etapa', { de, para, ...(motivo ? { motivo } : {}) })
}

export interface NovaAcao {
  titulo: string
  descricao: string
  responsavel_id: string
  prazo: string
  categoria?: string | null
  item_id?: string | null
}

/** R8: ação = ticket comum, solicitante = condutor, aceite normal, visibilidade herdada (R12). */
export async function criarAcao(auth: Autenticado, r: ReuniaoCarregada, a: NovaAcao): Promise<Ticket> {
  const condutor = condutorDe(r)
  const linha = {
    tipo: 'generico', titulo: a.titulo, descricao: a.descricao, categoria: a.categoria || r.ticket.categoria || 'Outros',
    prazo: a.prazo, visibilidade: r.ticket.visibilidade, solicitante_id: condutor, responsavel_id: a.responsavel_id,
    origem_reuniao_id: r.ticket.id, origem_reuniao_item_id: a.item_id || null,
    aceite: a.responsavel_id === condutor ? 'ok' : 'pendente',
    payload: { origem: 'reuniao', reuniao_titulo: r.ticket.titulo },
  }
  const t = ok(await supabaseAdmin.from('tickets').insert(linha).select('*').single()) as Ticket
  await garantirParticipante(t.id, condutor, null)
  await garantirParticipante(t.id, a.responsavel_id, auth.userId)
  if (auth.userId !== condutor) await garantirParticipante(t.id, auth.userId, auth.userId)
  await registrarEvento(t.id, auth.userId, 'criacao', { titulo: a.titulo, responsavel_id: a.responsavel_id, origem_reuniao_id: r.ticket.id, item_id: a.item_id || null })
  await registrarEvento(r.ticket.id, auth.userId, 'acao_criada', { ticket_id: t.id, numero: t.numero, titulo: a.titulo, responsavel_id: a.responsavel_id, prazo: a.prazo, item_id: a.item_id || null })
  await notificarTicket(t, [a.responsavel_id], auth.userId, `Ação da reunião: #${t.numero} ${a.titulo}`,
    a.responsavel_id === condutor ? 'Você é o responsável por esta ação.' : `Nasceu em "${r.ticket.titulo}". Confirme se consegue fazer até ${a.prazo.split('-').reverse().join('/')}.`)
  return t
}

/** Transferência (reatribuir) — mesma regra da ação `transferir` do motor. */
export async function reatribuirAcao(auth: Autenticado, acao: Ticket, para: string, nomePara: string) {
  const anterior = acao.responsavel_id
  ok(await supabaseAdmin.from('tickets').update({ responsavel_id: para, aceite: para === auth.userId ? 'ok' : 'pendente', aceite_motivo: null }).eq('id', acao.id).select('id'))
  await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', acao.id).eq('user_id', anterior)
  await garantirParticipante(acao.id, anterior, auth.userId)
  await garantirParticipante(acao.id, para, auth.userId)
  await registrarEvento(acao.id, auth.userId, 'transferencia', { de: anterior, para })
  const base = await carregarTicket(acao.id)
  const todos = base ? [base.ticket.solicitante_id, ...base.participantes.filter((p) => !p.removido_em).map((p) => p.user_id)] : []
  await notificarTicket({ ...acao, responsavel_id: para }, [...todos, para], auth.userId, `Ticket #${acao.numero} transferido para ${nomePara}`, acao.titulo)
}

export async function novoPrazoAcao(auth: Autenticado, acao: Ticket, novoPrazo: string) {
  ok(await supabaseAdmin.from('tickets').update({ prazo: novoPrazo, prazo_reprogramacoes: (acao.prazo_reprogramacoes || 0) + 1 }).eq('id', acao.id).select('id'))
  await registrarEvento(acao.id, auth.userId, 'edicao', { mudancas: { prazo: { de: acao.prazo, para: novoPrazo } }, reprogramacoes: (acao.prazo_reprogramacoes || 0) + 1 })
  await moverEtapaDoTicket(acao.id, novoPrazo)
}

export async function cancelarAcao(auth: Autenticado, acao: Ticket, motivo: string) {
  ok(await supabaseAdmin.from('tickets').update({ ...camposDoStatus('cancelado') }).eq('id', acao.id).select('id'))
  await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', acao.id)
  await registrarEvento(acao.id, auth.userId, 'status', { de: acao.status, para: 'cancelado', motivo })
  await sincronizarEtapaDoTicket({ id: acao.id, status: 'cancelado' })
}

/** "Escalar": vira item de pauta (pendencia_escalada) na PRÓXIMA reunião da série, ou soma um participante indicado. */
export async function escalarAcao(auth: Autenticado, r: ReuniaoCarregada, acao: Ticket, para: string | null): Promise<{ item_id?: string; reuniao_id?: string; participante?: string }> {
  if (para) {
    await garantirParticipante(acao.id, para, auth.userId)
    await registrarEvento(acao.id, auth.userId, 'participante_adicionado', { user_id: para, escalado: true })
    await notificarTicket(acao, [para], auth.userId, `Ação #${acao.numero} escalada para você`, acao.titulo)
    return { participante: para }
  }
  if (!r.serie) throw Object.assign(new Error('Reunião avulsa não tem próxima reunião — indique uma pessoa para escalar.'), { code: 'SEM_SERIE' })
  const prox = await garantirProximaInstancia(auth, r.serie, r.ticket.reuniao_inicio!)
  if (!prox) throw Object.assign(new Error('A série não tem recorrência — crie a próxima reunião antes de escalar.'), { code: 'SEM_PROXIMA' })
  const { data: maxRow } = await supabaseAdmin.from('reunioes_itens').select('ordem').eq('reuniao_id', prox.id).order('ordem', { ascending: false }).limit(1)
  const item = ok(await supabaseAdmin.from('reunioes_itens').insert({
    reuniao_id: prox.id, ordem: (maxRow?.[0]?.ordem ?? -1) + 1, tipo: 'decidir',
    pergunta: `O que fazer com a ação #${acao.numero} "${acao.titulo}" (prazo reprogramado ${acao.prazo_reprogramacoes || 0}×)?`,
    trazido_por: auth.userId, tempo_min: 5, origem: 'pendencia_escalada', ticket_referencia_id: acao.id, criado_por: auth.userId,
  }).select('id').single()) as { id: string }
  await registrarEvento(prox.id, auth.userId, 'edicao', { campo: 'pauta', incluido: item.id, origem: 'pendencia_escalada', ticket_id: acao.id })
  return { item_id: item.id, reuniao_id: prox.id }
}

export async function publicarAta(auth: Autenticado, r: ReuniaoCarregada, link: string): Promise<AtaRow> {
  const [acoes, pend] = await Promise.all([
    supabaseAdmin.from('tickets').select('id, numero, titulo, responsavel_id, prazo, status, aceite').eq('origem_reuniao_id', r.ticket.id).order('created_at'),
    blocoPendencias(r),
  ])
  const lista = ok(acoes) as Array<{ id: string; numero: number; titulo: string; responsavel_id: string; prazo: string | null; status: string; aceite: string | null }>
  const nome = await nomes([...lista.map((a) => a.responsavel_id), ...r.presencas.map((p) => p.usuario_id), ...r.itens.map((i) => i.trazido_por)])
  const decididos = r.itens.filter((i) => i.resultado === 'decidido').length
  const texto = textoWhatsApp({
    serie: r.serie?.nome || null, titulo: r.ticket.titulo, data: r.ticket.prazo || diaSP(r.ticket.reuniao_inicio!),
    decididos, atrasadas: pend.atrasadas.length, link,
    acoes: lista.map((a) => ({ responsavel: nome[a.responsavel_id] || '—', titulo: a.titulo, prazo: a.prazo })),
  })
  const snapshot = {
    reuniao: { id: r.ticket.id, numero: r.ticket.numero, titulo: r.ticket.titulo, inicio: r.ticket.reuniao_inicio, serie: r.serie ? { id: r.serie.id, nome: r.serie.nome } : null },
    itens: r.itens.map((i) => ({ id: i.id, ordem: i.ordem, pergunta: i.pergunta, tipo: i.tipo, trazido_por: i.trazido_por, trazido_por_nome: nome[i.trazido_por] || null, origem: i.origem, resultado: i.resultado, decisao_texto: i.decisao_texto, decisao_motivo: i.decisao_motivo, notas: i.notas })),
    acoes: lista.map((a) => ({ ...a, responsavel_nome: nome[a.responsavel_id] || null })),
    presencas: r.presencas.map((p) => ({ usuario_id: p.usuario_id, nome: nome[p.usuario_id] || null, papel: p.papel, presente: p.presente })),
    pendencias: { atrasadas: pend.atrasadas.map((p) => ({ id: p.id, numero: p.numero, titulo: p.titulo, dias_atraso: p.dias_atraso })), concluidas: pend.concluidas },
  }
  const ata = ok(await supabaseAdmin.from('reunioes_ata').insert({ reuniao_id: r.ticket.id, publicada_por: auth.userId, snapshot, texto_whatsapp: texto }).select('*').single()) as AtaRow
  await mudarEtapa(auth, r, 'ata_publicada')
  await registrarEvento(r.ticket.id, auth.userId, 'ata_publicada', { decididos, acoes: lista.length, atrasadas: pend.atrasadas.length })
  // Sugestões para a próxima reunião, se ela já existe (senão a criação dela puxa).
  if (r.serie) {
    const prox = await proximaReuniaoDaSerie(r.serie.id, r.ticket.reuniao_inicio!, r.ticket.id)
    if (prox) await puxarSugestoes(prox, r.serie, auth.userId)
  }
  const destinatarios = r.presencas.map((p) => p.usuario_id)
  await notificarTicket(r.ticket, destinatarios, auth.userId, `Ata publicada: ${r.ticket.titulo}`, `${decididos} decisão(ões) · ${lista.length} ação(ões) · ${pend.atrasadas.length} pendência(s) atrasada(s).`)
  return ata
}
