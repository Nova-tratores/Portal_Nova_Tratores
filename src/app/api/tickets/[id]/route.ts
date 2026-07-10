// Tickets — detalhe: ticket + participantes + timeline + nomes dos envolvidos.
// GET /api/tickets/:id
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets, carregarTicket, podeVer } from '@/lib/tickets/server'
import type { TicketEvento } from '@/lib/tickets/constantes'

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
  if (!podeVer(ticket, participantes, auth)) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 })
  }

  const { data: eventos } = await supabaseAdmin
    .from('tickets_eventos')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })
    .limit(1000)

  const ids = new Set<string>([ticket.solicitante_id, ticket.responsavel_id])
  for (const p of participantes) ids.add(p.user_id)
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

  return NextResponse.json({ ticket, participantes, eventos: eventos || [], usuarios })
}
