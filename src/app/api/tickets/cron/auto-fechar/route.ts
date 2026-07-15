// Tickets — auto-fechamento (ADR-004): ticket "resolvido" sem manifestação do
// solicitante por AUTO_FECHAR_DIAS fecha sozinho. Chamado por GitHub Actions
// (.github/workflows/tickets-auto-fechar.yml) com x-cron-secret.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { carregarTicket, envolvidos, registrarEvento, notificarTicket } from '@/lib/tickets/server'
import { AUTO_FECHAR_DIAS, type Ticket } from '@/lib/tickets/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function executar(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const provided = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
    if (provided !== secret) return NextResponse.json({ ok: false, erro: 'unauthorized' }, { status: 401 })
  }

  const corte = new Date(Date.now() - AUTO_FECHAR_DIAS * 86400000).toISOString()
  const { data: vencidos, error } = await supabaseAdmin
    .from('tickets')
    .select('id, numero, titulo')
    .eq('status', 'resolvido')
    .lt('resolvido_em', corte)
    .limit(200)
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })

  let fechados = 0
  for (const t of vencidos || []) {
    const { error: upErr } = await supabaseAdmin
      .from('tickets')
      .update({ status: 'fechado', fechado_em: new Date().toISOString() })
      .eq('id', t.id)
      .eq('status', 'resolvido') // proteção contra corrida com ação manual
    if (upErr) continue
    // Encerrou: sai da fila pessoal (tickets_plano) de todo mundo.
    await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', t.id)
    // autor_id null = evento do sistema
    await registrarEvento(t.id, null, 'status', {
      de: 'resolvido', para: 'fechado', auto: true,
      motivo: `Fechado automaticamente após ${AUTO_FECHAR_DIAS} dias sem manifestação do solicitante`,
    })
    const carregado = await carregarTicket(t.id)
    if (carregado) {
      await notificarTicket(
        carregado.ticket as Ticket,
        envolvidos(carregado.ticket, carregado.participantes),
        null,
        `Ticket #${t.numero} fechado automaticamente`,
        t.titulo,
      )
    }
    fechados++
  }

  return NextResponse.json({ ok: true, candidatos: (vencidos || []).length, fechados })
}

export async function POST(req: NextRequest) { return executar(req) }
export async function GET(req: NextRequest) { return executar(req) }
