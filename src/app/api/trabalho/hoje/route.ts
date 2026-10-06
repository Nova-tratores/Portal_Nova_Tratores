// CENTRAL DE TRABALHO — o que a pessoa tem agora.
// GET  /api/trabalho/hoje  -> tickets para confirmar, itens do dia, se já
//                            confirmou o dia, preferência do atalho e a hora
// POST /api/trabalho/hoje  { acao:'confirmar_dia' } | { acao:'preferencias', atalho_flutuante }
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  pendentesDeAceite, itensDoDia, diaConfirmado, confirmarDia, preferencias, salvarPreferencias,
} from '@/lib/trabalho/agenda-server'
import { temModuloTickets } from '@/lib/tickets/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function horaSP(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ ativo: false })
  const [pend, itens, confirmado, pref] = await Promise.all([
    pendentesDeAceite(auth.userId), itensDoDia(auth.userId), diaConfirmado(auth.userId), preferencias(auth.userId),
  ])
  // nomes de quem pediu e dos quadros
  const pessoas = [...new Set(pend.map((p: { solicitante_id: string }) => p.solicitante_id))]
  const quadros = [...new Set(pend.map((p: { quadro_id: string | null }) => p.quadro_id).filter(Boolean))] as string[]
  const [{ data: us }, { data: qs }] = await Promise.all([
    pessoas.length ? supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', pessoas) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    quadros.length ? supabaseAdmin.from('tickets_quadros').select('id, nome').in('id', quadros) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ])
  const nomeU = new Map((us || []).map((u) => [u.id, u.nome]))
  const nomeQ = new Map((qs || []).map((q) => [q.id, q.nome]))
  const { data: pedidos } = await supabaseAdmin.from('tickets').select('id', { count: 'exact', head: false })
    .eq('solicitante_id', auth.userId).neq('responsavel_id', auth.userId).not('status', 'in', '(fechado,cancelado)')
  return NextResponse.json({
    ativo: true,
    hora: horaSP(),
    pendentes: pend.map((p: { id: string; numero: number; titulo: string; prazo: string | null; solicitante_id: string; quadro_id: string | null }) => ({
      ...p, solicitante_nome: nomeU.get(p.solicitante_id) || 'Alguém', quadro_nome: p.quadro_id ? nomeQ.get(p.quadro_id) || null : null,
    })),
    itens,
    confirmado,
    pedidos: (pedidos || []).length,
    preferencias: pref,
  })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    if (body.acao === 'confirmar_dia') { await confirmarDia(auth.userId); return NextResponse.json({ ok: true }) }
    if (body.acao === 'preferencias') { await salvarPreferencias(auth.userId, { atalho_flutuante: body.atalho_flutuante !== false }); return NextResponse.json({ ok: true }) }
    return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'A Central de Trabalho ainda não foi ativada no banco (rode sql/central-trabalho.sql).' }, { status: 503 })
  }
}
