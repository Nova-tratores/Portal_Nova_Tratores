// Tickets — detalhe: ticket + participantes + timeline + nomes dos envolvidos.
// GET /api/tickets/:id
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets, carregarTicket, podeVerTicket, carregarVinculos } from '@/lib/tickets/server'
import type { TicketEvento } from '@/lib/tickets/constantes'
import { etapasDosTickets, projetoDoQuadro } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { id } = await params
  const carregado = await carregarTicket(id)
  if (!carregado) return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  const { ticket, participantes } = carregado

  // Privado por padrão: quem não é envolvido nem admin não sabe que existe.
  if (!(await podeVerTicket(ticket, participantes, auth))) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  }

  // Tudo que não depende de outra consulta vai junto (a janela abre mais rápido):
  // timeline, vínculos, quadro + colunas, etapa do cronograma e projeto do quadro.
  const [{ data: eventos }, vinculos, quadroRes, colsRes, etapas, projetoDoBloco] = await Promise.all([
    supabaseAdmin
      .from('tickets_eventos')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })
      .limit(1000),
    carregarVinculos(id),
    ticket.quadro_id
      ? supabaseAdmin.from('tickets_quadros').select('id, nome, cor').eq('id', ticket.quadro_id).maybeSingle()
      : Promise.resolve({ data: null }),
    ticket.quadro_id
      ? supabaseAdmin.from('tickets_quadro_colunas').select('id, nome, posicao').eq('quadro_id', ticket.quadro_id).order('posicao')
      : Promise.resolve({ data: [] }),
    etapasDosTickets([ticket.id]),
    ticket.quadro_id ? projetoDoQuadro(ticket.quadro_id) : Promise.resolve(null),
  ])

  const ids = new Set<string>([ticket.solicitante_id, ticket.responsavel_id])
  for (const p of participantes) ids.add(p.user_id)
  for (const v of vinculos) if (v.criado_por) ids.add(v.criado_por)
  for (const e of (eventos || []) as TicketEvento[]) {
    if (e.autor_id) ids.add(e.autor_id)
    const para = e.payload?.para
    const de = e.payload?.de
    const uid = e.payload?.user_id
    if (typeof para === 'string' && para.length === 36) ids.add(para)
    if (typeof de === 'string' && de.length === 36) ids.add(de)
    if (typeof uid === 'string') ids.add(uid)
  }

  const { data: usuariosData } = await supabaseAdmin
    .from('financeiro_usu')
    .select('id, nome, avatar_url, ativo')
    .in('id', [...ids])
  const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of usuariosData || []) usuarios[u.id] = u

  // Quadro do ticket (nome/cor + colunas, para o chip e a troca de coluna).
  let quadro: { id: string; nome: string; cor: string; colunas: { id: string; nome: string }[] } | null = null
  const q = quadroRes.data as { id: string; nome: string; cor: string } | null
  if (q) quadro = { ...q, colunas: ((colsRes.data || []) as { id: string; nome: string }[]).map((c) => ({ id: c.id, nome: c.nome })) }

  // Etapa do cronograma ligada + se o quadro tem cronograma (para "Planejar")
  const etapa = etapas[ticket.id] || null
  const projetoQuadro = etapa ? null : projetoDoBloco

  return NextResponse.json({ ticket, participantes, eventos: eventos || [], usuarios, vinculos, quadro, etapa, projetoQuadro })
}
