// War Room (Fase 1) — regras de negócio no SERVIDOR (uso exclusivo nas rotas
// /api/war-room/*, via service role). O browser só LÊ (RLS); toda mutação passa
// por aqui. Reutiliza os helpers do motor de tickets (não duplica lógica).
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import type { Autenticado } from '@/lib/auth/server'
import { registrarEvento, garantirParticipante, notificarTicket } from '@/lib/tickets/server'
import type { Ticket } from '@/lib/tickets/constantes'
import { MODULO_WAR_ROOM, FASE_LABEL, type WarRoomNivel, type WarRoomFase, type WarRoomAcao } from './constantes'

// Cliente Supabase COM O TOKEN DO USUÁRIO (role authenticated, auth.uid()
// presente) — para LEITURAS que respeitam RLS e as views de redação (que usam
// auth.uid(), logo ficariam vazias sob service role). Assim os GET não duplicam
// o corte núcleo/membro: o banco (RLS + views) já o aplica.
export function clienteDoUsuario(req: Request) {
  const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Acesso ao módulo (espelha temAcesso do usePermissoes, no servidor).
export function temModuloWarRoom(auth: Autenticado): boolean {
  if (auth.isAdmin) return true
  return (
    auth.modulos.includes(MODULO_WAR_ROOM) ||
    auth.modulos.some((m) => m.startsWith(MODULO_WAR_ROOM + ':'))
  )
}

// Nível efetivo do usuário. Admin/dev do portal contam como núcleo (espelha a
// função SQL war_room_nucleo()). Fora da lista e sem admin → null (mas pode ser
// dono de ação: nesse caso vê só as próprias, via RLS).
export async function nivelDoUsuario(auth: Autenticado): Promise<WarRoomNivel | null> {
  if (auth.isAdmin) return 'nucleo'
  const { data } = await supabaseAdmin
    .from('war_room_membros')
    .select('nivel, ativo')
    .eq('user_id', auth.userId)
    .maybeSingle()
  if (!data || data.ativo === false) return null
  return data.nivel as WarRoomNivel
}

export async function ehNucleo(auth: Autenticado): Promise<boolean> {
  return (await nivelDoUsuario(auth)) === 'nucleo'
}

// Ids dos membros ATIVOS de nível núcleo (para adicioná-los como participantes
// dos tickets war_room — garante visibilidade do detalhe em /tickets/[id]).
export async function idsNucleoAtivos(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('war_room_membros')
    .select('user_id')
    .eq('nivel', 'nucleo')
    .eq('ativo', true)
  return (data || []).map((m: { user_id: string }) => m.user_id)
}

// Registra uma mudança de acesso no log append-only (auditoria).
export async function registrarLogMembro(
  userId: string,
  nivel: WarRoomNivel | null,
  ativo: boolean,
  acao: 'add' | 'update' | 'remove',
  por: string | null,
) {
  await supabaseAdmin.from('war_room_membros_log').insert({
    user_id: userId, nivel, ativo, acao, por,
  })
}

// Ponto 4 da revisão do GATE 1: quem é PROMOVIDO a núcleo precisa enxergar o
// detalhe dos tickets war_room já abertos (tickets_pode_ver exige ser
// participante). Adiciona a pessoa como participante de todos os tickets
// war_room não encerrados e registra um evento (auditável de graça).
export async function adicionarNucleoAosTicketsAbertos(userId: string, por: string | null) {
  const { data: tickets } = await supabaseAdmin
    .from('tickets')
    .select('id')
    .eq('tipo', 'war_room')
    .not('status', 'in', '(fechado,cancelado)')
  for (const t of tickets || []) {
    // insere se não existe; revive se estava removido (idempotente)
    const { data: existente } = await supabaseAdmin
      .from('tickets_participantes')
      .select('id, removido_em')
      .eq('ticket_id', t.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!existente) {
      await supabaseAdmin.from('tickets_participantes').insert({
        ticket_id: t.id, user_id: userId, adicionado_por: por,
      })
      await registrarEvento(t.id, por, 'participante_adicionado', {
        user_id: userId, motivo: 'Entrou no núcleo do War Room',
      })
    } else if (existente.removido_em) {
      await supabaseAdmin.from('tickets_participantes')
        .update({ removido_em: null }).eq('id', existente.id)
    }
  }
}

export interface NovaAcaoParams {
  titulo: string
  descricao: string
  dono_id: string
  fase: WarRoomFase
  causa_raiz?: string
  entregavel?: string
  indicador?: string
  meta?: string
  consequencia?: string
  prazo_estrategico?: string | null
  ordem?: number
}

// Cria uma AÇÃO do plano = ticket tipo='war_room' + linha em war_room_acoes.
// Caminho TS (igual a criarSC): sem RPC, chamadas sequenciais via service role,
// mesma tolerância a falha parcial do motor. O CRIADOR é o solicitante; o DONO
// é o responsável. Núcleo entra como participante (visibilidade do detalhe).
// Devolve { ticket, acao } ou { error }.
export async function criarAcaoWarRoom(
  auth: Autenticado,
  p: NovaAcaoParams,
): Promise<{ ticket: Ticket; acao: WarRoomAcao } | { error: string }> {
  // Dono precisa ser usuário ativo do portal.
  const { data: dono } = await supabaseAdmin
    .from('financeiro_usu').select('id, ativo').eq('id', p.dono_id).maybeSingle()
  if (!dono || dono.ativo === false) return { error: 'Responsável (dono) inválido ou inativo' }

  const { data: criado, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      tipo: 'war_room',
      status: 'aberto',
      categoria: 'War Room',
      visibilidade: 'privado',
      titulo: p.titulo,
      descricao: p.descricao,
      prazo: p.prazo_estrategico ?? null,
      solicitante_id: auth.userId,
      responsavel_id: p.dono_id,
    })
    .select('*')
    .single()
  if (error || !criado) return { error: error?.message || 'Falha ao criar o ticket da ação' }
  const ticket = criado as Ticket

  const { data: acaoCriada, error: acaoErr } = await supabaseAdmin
    .from('war_room_acoes')
    .insert({
      ticket_id: ticket.id,
      fase: p.fase,
      causa_raiz: p.causa_raiz || '',
      entregavel: p.entregavel || '',
      indicador: p.indicador || '',
      meta: p.meta || '',
      consequencia: p.consequencia || '',
      prazo_estrategico: p.prazo_estrategico ?? null,
      ordem: p.ordem ?? 0,
    })
    .select('*')
    .single()
  if (acaoErr || !acaoCriada) return { error: acaoErr?.message || 'Falha ao criar a ação (satélite)' }

  // Participantes: criador + dono + núcleo (todos com visibilidade do detalhe).
  await garantirParticipante(ticket.id, auth.userId, null)
  await garantirParticipante(ticket.id, p.dono_id, auth.userId)
  for (const id of await idsNucleoAtivos()) {
    if (id !== auth.userId && id !== p.dono_id) await garantirParticipante(ticket.id, id, auth.userId)
  }

  await registrarEvento(ticket.id, auth.userId, 'wr_acao_criada', {
    titulo: p.titulo, fase: p.fase, dono_id: p.dono_id,
  })
  await notificarTicket(
    ticket, [p.dono_id], auth.userId,
    `Nova ação do War Room #${ticket.numero}: ${p.titulo}`,
    `Você é o dono desta ação (${FASE_LABEL[p.fase]}).`,
  )

  return { ticket, acao: acaoCriada as WarRoomAcao }
}

// Snapshot ABERTO da semana corrente (o mais recente ainda não fechado).
export async function carregarSnapshotAberto() {
  const { data } = await supabaseAdmin
    .from('war_room_snapshots')
    .select('*')
    .is('fechado_em', null)
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}
