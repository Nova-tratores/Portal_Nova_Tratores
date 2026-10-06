// Tickets — listagem por visão + criação.
// GET  /api/tickets?visao=fila|pedidos|acompanhando|gerencial[&encerrados=1]
// POST /api/tickets  { titulo, descricao, responsavel_id, categoria?, prazo?, terceiro_envolvido?, visibilidade?, anexos? }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloTickets, registrarEvento, notificarTicket, garantirParticipante,
} from '@/lib/tickets/server'
import { STATUS_FINAIS, type Ticket, type TicketPlanoItem, type TicketVisibilidade } from '@/lib/tickets/constantes'
import { validarNovaSC } from '@/lib/tickets/compras'
import { carregarConfigCompras, avaliarBloqueio } from '@/lib/tickets/compras-server'
import type { Autenticado } from '@/lib/auth/server'
import { carregarQuadro, papeis } from '@/lib/tickets/quadros-server'
import { colunaDoTicket } from '@/lib/tickets/quadros'

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
  } else if (visao === 'compras') {
    // Pipeline da SC: todas as SCs que o usuário pode acompanhar. Papéis fixos
    // (diretoria/financeiro/comprador) e admin veem o trilho inteiro; os demais,
    // só as SCs onde são solicitante, responsável (a bola) ou participante.
    query = query.eq('tipo', 'compras')
    if (!auth.isAdmin) {
      const config = await carregarConfigCompras()
      const papeis = [config.diretoria_id, config.financeiro_id, config.comprador_id].filter(Boolean)
      if (!papeis.includes(auth.userId)) {
        const orParts = [`solicitante_id.eq.${auth.userId}`, `responsavel_id.eq.${auth.userId}`]
        if (idsParticipa.length) orParts.push(`id.in.(${idsParticipa.join(',')})`)
        query = query.or(orParts.join(','))
      }
    }
  } else {
    return NextResponse.json({ error: 'Visão inválida' }, { status: 400 })
  }

  // A SC mostra também as etapas terminais (concluída/cancelada) no kanban.
  if (!incluirEncerrados && visao !== 'compras') query = query.not('status', 'in', finais)

  const { data: tickets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lista = (tickets || []) as Ticket[]
  const usuarios = await mapaUsuarios(lista.flatMap((t) => [t.solicitante_id, t.responsavel_id]))

  // Fila: devolve também o plano pessoal (ordem planejada + "mexendo agora").
  if (visao === 'fila') {
    const { data: planoRows } = await supabaseAdmin
      .from('tickets_plano')
      .select('ticket_id, posicao, atual')
      .eq('user_id', auth.userId)
      .order('posicao')
    let plano = (planoRows || []) as TicketPlanoItem[]

    // Limpeza lazy de órfãos (ticket transferido/encerrado fora daqui).
    // Só quando a lista é o conjunto elegível completo: sem encerrados e
    // sem truncamento pelo limit (lista cortada apagaria entradas válidas).
    if (!incluirEncerrados && lista.length < 500) {
      const idsFila = new Set(lista.map((t) => t.id))
      const orfaos = plano.filter((p) => !idsFila.has(p.ticket_id)).map((p) => p.ticket_id)
      if (orfaos.length > 0) {
        await supabaseAdmin
          .from('tickets_plano')
          .delete()
          .eq('user_id', auth.userId)
          .in('ticket_id', orfaos)
        plano = plano.filter((p) => idsFila.has(p.ticket_id))
      }
    }
    return NextResponse.json({ tickets: lista, usuarios, contadores, plano })
  }

  return NextResponse.json({ tickets: lista, usuarios, contadores })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  // Solicitação de Compras (tipo='compras') tem trilho e campos próprios.
  if (body.tipo === 'compras') return criarSC(auth, body)

  const titulo = String(body.titulo || '').trim()
  const descricao = String(body.descricao || '').trim()
  const responsavelId = String(body.responsavel_id || '').trim()
  const categoria = String(body.categoria || '').trim()
  const terceiro = String(body.terceiro_envolvido || '').trim()
  const prazo = body.prazo ? String(body.prazo) : null
  const visibilidade: TicketVisibilidade = body.visibilidade === 'publico' ? 'publico' : 'privado'
  // Anexos da criação (ex.: print do clique direito) — viram eventos 'anexo'
  const anexos = (Array.isArray(body.anexos) ? (body.anexos as { url?: unknown; nome?: unknown }[]) : [])
    .map((a) => ({ url: String(a?.url || ''), nome: String(a?.nome || 'arquivo').slice(0, 120) }))
    .filter((a) => /^https?:\/\//.test(a.url))
    .slice(0, 5)

  if (!titulo) return NextResponse.json({ error: 'Informe o título do ticket' }, { status: 400 })
  if (!descricao) return NextResponse.json({ error: 'Descreva o pedido (quem pediu e por quê fica registrado)' }, { status: 400 })
  if (!responsavelId) return NextResponse.json({ error: 'Escolha o responsável' }, { status: 400 })

  // O responsável precisa ser um usuário ativo do portal.
  const { data: resp } = await supabaseAdmin
    .from('financeiro_usu').select('id, nome, ativo').eq('id', responsavelId).maybeSingle()
  if (!resp || resp.ativo === false) return NextResponse.json({ error: 'Responsável inválido ou inativo' }, { status: 400 })

  // Criado dentro de um quadro (sql/tickets-quadros.sql): precisa poder
  // trabalhar nele; coluna inválida cai na primeira.
  const noQuadro: { quadro_id?: string; quadro_coluna_id?: string | null } = {}
  if (body.quadro_id) {
    const c = await carregarQuadro(String(body.quadro_id))
    if (!c || c.quadro.arquivado) return NextResponse.json({ error: 'Quadro não encontrado' }, { status: 404 })
    if (!papeis(c, auth).trabalhar) return NextResponse.json({ error: 'Você não é integrante deste quadro.' }, { status: 403 })
    noQuadro.quadro_id = c.quadro.id
    noQuadro.quadro_coluna_id = colunaDoTicket(body.quadro_coluna_id ? String(body.quadro_coluna_id) : null, c.colunas)
  }

  const { data: criado, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      titulo, descricao, categoria, prazo,
      terceiro_envolvido: terceiro,
      visibilidade,
      solicitante_id: auth.userId,
      responsavel_id: responsavelId,
      ...noQuadro,
    })
    .select('*')
    .single()
  if (error || !criado) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })

  const ticket = criado as Ticket
  await garantirParticipante(ticket.id, auth.userId, null)
  await garantirParticipante(ticket.id, responsavelId, auth.userId)
  await registrarEvento(ticket.id, auth.userId, 'criacao', { titulo, responsavel_id: responsavelId })
  for (const a of anexos) {
    await registrarEvento(ticket.id, auth.userId, 'anexo', a)
  }
  await notificarTicket(
    ticket, [responsavelId], auth.userId,
    `Novo ticket #${ticket.numero}: ${titulo}`,
    'Você é o responsável por este ticket.',
  )

  return NextResponse.json({ ticket })
}
// --------------------------------------------------------------------------
// Criação de uma Solicitação de Compras. O vendedor (chamador) abre a SC; a
// bola vai direto para a pessoa fixa da Diretoria (config). Emite o evento
// imutável `sc_criada` e sinaliza (flag suave) se já nasce em bloqueio.
// --------------------------------------------------------------------------
async function criarSC(auth: Autenticado, body: Record<string, unknown>) {
  const validado = validarNovaSC(body)
  if ('erro' in validado) return NextResponse.json({ error: validado.erro }, { status: 400 })
  const { payload, descricao, titulo } = validado.dados

  const config = await carregarConfigCompras()
  if (!config.diretoria_id) {
    return NextResponse.json({ error: 'A Diretoria de Compras ainda não foi designada. Peça a um administrador para configurar os responsáveis das etapas.' }, { status: 400 })
  }

  const bloqueio = await avaliarBloqueio(payload, config)
  if (bloqueio) payload.bloqueio = bloqueio

  const { data: criado, error } = await supabaseAdmin
    .from('tickets')
    .insert({
      tipo: 'compras',
      sc_etapa: 'diretoria',
      status: 'aguardando_interno',
      categoria: 'Compras',
      titulo,
      descricao,
      solicitante_id: auth.userId,
      responsavel_id: config.diretoria_id,
      payload,
    })
    .select('*')
    .single()
  if (error || !criado) return NextResponse.json({ error: error?.message || 'Falha ao criar' }, { status: 500 })

  const ticket = criado as Ticket
  await garantirParticipante(ticket.id, auth.userId, null)
  await garantirParticipante(ticket.id, config.diretoria_id, auth.userId)
  // Snapshot do pedido na timeline imutável (sem o aviso de bloqueio, que é derivado).
  const { bloqueio: _b, ...snapshot } = payload
  void _b
  await registrarEvento(ticket.id, auth.userId, 'sc_criada', snapshot)
  await notificarTicket(
    ticket, [config.diretoria_id], auth.userId,
    `Nova Solicitação de Compras #${ticket.numero}: ${payload.produto}`,
    'Você é a Diretoria responsável por avaliar esta SC.',
  )

  return NextResponse.json({ ticket })
}
