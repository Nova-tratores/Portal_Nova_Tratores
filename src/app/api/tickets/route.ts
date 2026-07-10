// Tickets — listagem por visão + criação.
// GET  /api/tickets?visao=fila|pedidos|acompanhando|gerencial[&encerrados=1]
// POST /api/tickets  { titulo, descricao, responsavel_id, categoria?, prazo?, terceiro_envolvido?, visibilidade? }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloTickets, registrarEvento, notificarTicket, garantirParticipante,
} from '@/lib/tickets/server'
import { STATUS_FINAIS, type Ticket, type TicketVisibilidade } from '@/lib/tickets/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mapa id → {nome, avatar_url} dos usuários citados nos tickets.
async function mapaUsuarios(ids: string[]) {
  const unicos = [...new Set(ids)].filter(Boolean)
  if (unicos.length === 0) return {}
  const { data } = await supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', unicos)
  const mapa: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of data || []) mapa[u.id] = u
  return mapa
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const visao = req.nextUrl.searchParams.get('visao') || 'fila'
  const incluirEncerrados = req.nextUrl.searchParams.get('encerrados') === '1'
  const finais = `(${STATUS_FINAIS.join(',')})`

  // Tickets em que o usuário é participante ativo (visão + contador "acompanhando")
  const { data: parts } = await supabaseAdmin
    .from('tickets_participantes')
    .select('ticket_id')
    .eq('user_id', auth.userId)
    .is('removido_em', null)
    .limit(500)
  const idsParticipa = (parts || []).map((p) => p.ticket_id)

  // Contadores por aba (só tickets ativos), para os badges das visões.
  const contar = async (montar: () => PromiseLike<{ count: number | null }>) => (await montar()).count || 0
  const base = () => supabaseAdmin.from('tickets').select('id', { count: 'exact', head: true }).not('status', 'in', finais)
  const [cFila, cPedidos, cAcompanhando, cGerencial] = await Promise.all([
    contar(() => base().eq('responsavel_id', auth.userId)),
    contar(() => base().eq('solicitante_id', auth.userId)),
    idsParticipa.length
      ? contar(() => base().in('id', idsParticipa).neq('responsavel_id', auth.userId).neq('solicitante_id', auth.userId))
      : Promise.resolve(0),
    auth.isAdmin ? contar(() => base()) : Promise.resolve(0),
  ])
  const contadores = { fila: cFila, pedidos: cPedidos, acompanhando: cAcompanhando, gerencial: cGerencial }

  let query = supabaseAdmin.from('tickets').select('*').order('ultima_atividade_em', { ascending: false }).limit(500)

  if (visao === 'fila') {
    query = query.eq('responsavel_id', auth.userId)
  } else if (visao === 'pedidos') {
    query = query.eq('solicitante_id', auth.userId)
  } else if (visao === 'acompanhando') {
    if (idsParticipa.length === 0) return NextResponse.json({ tickets: [], usuarios: {}, contadores })
    query = query.in('id', idsParticipa).neq('responsavel_id', auth.userId).neq('solicitante_id', auth.userId)
  } else if (visao === 'gerencial') {
    if (!auth.isAdmin) return NextResponse.json({ error: 'Visão gerencial é restrita a administradores' }, { status: 403 })
  } else {
    return NextResponse.json({ error: 'Visão inválida' }, { status: 400 })
  }

  if (!incluirEncerrados) query = query.not('status', 'in', finais)

  const { data: tickets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lista = (tickets || []) as Ticket[]
  const usuarios = await mapaUsuarios(lista.flatMap((t) => [t.solicitante_id, t.responsavel_id]))
  return NextResponse.json({ tickets: lista, usuarios, contadores })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const titulo = String(body.titulo || '').trim()
  const descricao = String(body.descricao || '').trim()
  const responsavelId = String(body.responsavel_id || '').trim()
  const categoria = String(body.categoria || '').trim()
  const terceiro = String(body.terceiro_envolvido || '').trim()
  const prazo = body.prazo ? String(body.prazo) : null
  const visibilidade: TicketVisibilidade = body.visibilidade === 'publico' ? 'publico' : 'privado'

  if (!titulo) return NextResponse.json({ error: 'Informe o título do ticket' }, { status: 400 })
  if (!descricao) return NextResponse.json({ error: 'Descreva o pedido (quem pediu e por quê fica registrado)' }, { status: 400 })
  if (!responsavelId) return NextResponse.json({ error: 'Escolha o responsável' }, { status: 400 })

  // O responsável precisa ser um usuário ativo do portal.
  const { data: resp } = await supabaseAdmin
    .from('financeiro_usu').select('id, nome, ativo').eq('id', responsavelId).maybeSingle()
  if (!resp || resp.ativo === false) return NextResponse.json({ error: 'Responsável inválido ou inativo' }, { status: 400 })

  const { data: criado, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      titulo, descricao, categoria, prazo,
      terceiro_envolvido: terceiro,
      visibilidade,
      solicitante_id: auth.userId,
      responsavel_id: responsavelId,
    })
    .select('*')
    .single()
  if (error || !criado) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })

  const ticket = criado as Ticket
  await garantirParticipante(ticket.id, auth.userId, null)
  await garantirParticipante(ticket.id, responsavelId, auth.userId)
  await registrarEvento(ticket.id, auth.userId, 'criacao', { titulo, responsavel_id: responsavelId })
  await notificarTicket(
    ticket, [responsavelId], auth.userId,
    `Novo ticket #${ticket.numero}: ${titulo}`,
    'Você é o responsável por este ticket.',
  )

  return NextResponse.json({ ticket })
}
