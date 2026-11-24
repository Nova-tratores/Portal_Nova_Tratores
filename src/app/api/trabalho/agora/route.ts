// MODO AGORA (24/11/2026) — o cronômetro do item da vez na Minha fila.
// GET  /api/trabalho/agora                       -> { rodando: { ticket_id, inicio } | null, horas: { [ticket]: horas reais } }
// POST /api/trabalho/agora { acao:'comecar', ticket_id } -> fecha o que estava rodando e abre este
// POST /api/trabalho/agora { acao:'pausar', ticket_id? }  -> fecha o que estiver rodando (só desse ticket, se vier)
// A situação do ticket (em andamento / resolvido) continua pela /api/tickets/[id]/acoes; aqui é só o tempo.
// Sem a tabela (sql/fila-tempo.sql), responde semTabela e a tela segue sem cronômetro.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { migrationFaltou } from '@/lib/marketing/erros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const uuid = (x: unknown) => /^[0-9a-f-]{36}$/i.test(String(x || ''))

async function fecharAberto(userId: string, ticketId?: string) {
  let q = supabaseAdmin.from('tickets_tempo').update({ fim: new Date().toISOString() }).eq('user_id', userId).is('fim', null)
  if (ticketId) q = q.eq('ticket_id', ticketId)
  const r = await q
  if (r.error) throw r.error
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  // Últimos 30 dias da pessoa: o que está rodando e as horas reais por ticket.
  const desde = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data, error } = await supabaseAdmin.from('tickets_tempo').select('ticket_id, inicio, fim')
    .eq('user_id', auth.userId).gte('inicio', desde).order('inicio', { ascending: false }).limit(500)
  if (error) return migrationFaltou(error) ? NextResponse.json({ rodando: null, horas: {}, semTabela: true }) : erro(error.message, 500)
  const agora = Date.now()
  const horas: Record<string, number> = {}
  let rodando: { ticket_id: string; inicio: string } | null = null
  for (const l of (data || []) as { ticket_id: string; inicio: string; fim: string | null }[]) {
    if (!l.fim) rodando = { ticket_id: l.ticket_id, inicio: l.inicio }
    horas[l.ticket_id] = (horas[l.ticket_id] || 0) + ((l.fim ? Date.parse(l.fim) : agora) - Date.parse(l.inicio)) / 3600000
  }
  return NextResponse.json({ rodando, horas })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    // pausar com ticket_id = só se o cronômetro aberto for desse ticket
    if (body.acao === 'pausar') { await fecharAberto(auth.userId, uuid(body.ticket_id) ? String(body.ticket_id) : undefined); return NextResponse.json({ ok: true }) }
    if (body.acao === 'comecar') {
      if (!uuid(body.ticket_id)) return erro('Escolha o item')
      // Só o que é da pessoa: ninguém liga o cronômetro no ticket do outro.
      const { data: t } = await supabaseAdmin.from('tickets').select('id').eq('id', String(body.ticket_id)).eq('responsavel_id', auth.userId).maybeSingle()
      if (!t) return erro('Este item não está na sua fila.', 403)
      await fecharAberto(auth.userId)
      const r = await supabaseAdmin.from('tickets_tempo').insert({ ticket_id: t.id, user_id: auth.userId })
      if (r.error) throw r.error
      return NextResponse.json({ ok: true })
    }
    return erro('Ação desconhecida')
  } catch (e) {
    if (migrationFaltou(e)) return erro('O cronômetro ainda não foi ativado no banco (rode sql/fila-tempo.sql).', 503)
    console.error('[agora] POST', e)
    return erro('Não deu certo', 500)
  }
}
