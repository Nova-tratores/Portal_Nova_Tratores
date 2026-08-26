// War Room — ações do plano (cada ação = ticket tipo='war_room').
// GET    lista as ações visíveis ao chamador (via view, RLS aplica o corte).
// POST   cria uma ação (SÓ núcleo) pelo caminho TS do motor (sem RPC).
// DELETE "remove do plano" = CANCELA o ticket da ação (SÓ núcleo). Não apaga
//        nada fisicamente — a timeline do ticket é imutável (governança).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloWarRoom, ehNucleo, criarAcaoWarRoom, clienteDoUsuario } from '@/lib/war-room/server'
import {
  carregarTicket, envolvidos, registrarEvento, notificarTicket, camposDoStatus,
} from '@/lib/tickets/server'
import { STATUS_FINAIS } from '@/lib/tickets/constantes'
import { FASES, type WarRoomFase } from '@/lib/war-room/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const supa = clienteDoUsuario(req)
  const { data, error } = await supa
    .from('v_war_room_acoes')
    .select('*')
    .order('fase')
    .order('ordem')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ acoes: data || [] })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo cria ações.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const titulo = String(body.titulo || '').trim()
  const descricao = String(body.descricao || '').trim()
  const dono_id = String(body.dono_id || body.responsavel_id || '').trim()
  const fase = String(body.fase || '').trim() as WarRoomFase
  if (!titulo) return NextResponse.json({ error: 'Informe o título da ação' }, { status: 400 })
  if (!descricao) return NextResponse.json({ error: 'Descreva a ação (origem imutável)' }, { status: 400 })
  if (!dono_id) return NextResponse.json({ error: 'Escolha o dono da ação' }, { status: 400 })
  if (!FASES.some((f) => f.id === fase)) return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })

  const res = await criarAcaoWarRoom(auth, {
    titulo, descricao, dono_id, fase,
    causa_raiz: String(body.causa_raiz || ''),
    entregavel: String(body.entregavel || ''),
    indicador: String(body.indicador || ''),
    meta: String(body.meta || ''),
    consequencia: String(body.consequencia || ''),
    prazo_estrategico: body.prazo_estrategico ? String(body.prazo_estrategico) : null,
    ordem: Number(body.ordem) || 0,
  })
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
  return NextResponse.json({ ticket: res.ticket, acao: res.acao })
}

// Cancela a ação (remove do plano ativo). SÓ núcleo — governança: o núcleo pode
// encerrar qualquer ação, então NÃO passa por validarTransicao (que exigiria ser
// solicitante/admin). Espelha o bloco 'status' de /api/tickets/[id]/acoes.
export async function DELETE(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloWarRoom(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  if (!(await ehNucleo(auth))) return NextResponse.json({ error: 'Só o núcleo cancela ações.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const ticketId = String(body.ticket_id || '').trim()
  if (!ticketId) return NextResponse.json({ error: 'Informe o ticket_id da ação' }, { status: 400 })

  const carregado = await carregarTicket(ticketId)
  if (!carregado || carregado.ticket.tipo !== 'war_room') {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 404 })
  }
  const { ticket, participantes } = carregado
  if (STATUS_FINAIS.includes(ticket.status)) {
    return NextResponse.json({ ok: true, jaEncerrada: true }) // idempotente
  }

  const { error } = await supabaseAdmin.from('tickets').update(camposDoStatus('cancelado')).eq('id', ticketId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Encerrou: sai da fila pessoal de todo mundo.
  await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', ticketId)
  await registrarEvento(ticketId, auth.userId, 'status', {
    de: ticket.status, para: 'cancelado', motivo: 'Removida do plano do War Room',
  })
  await notificarTicket(
    ticket, envolvidos(ticket, participantes), auth.userId,
    `Ação do War Room #${ticket.numero} cancelada`,
    ticket.titulo,
  )
  return NextResponse.json({ ok: true })
}
