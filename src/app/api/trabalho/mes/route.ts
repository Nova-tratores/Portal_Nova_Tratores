// GET /api/trabalho/mes — o mês de quem está logado na Minha fila (José, 26/11/2026):
// quantas tarefas chegaram, quantas concluiu, quantas contestou e quantas foram canceladas,
// tudo DENTRO do mês corrente (fuso de São Paulo). Conta pela timeline (tickets_eventos).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const mes = hoje.slice(0, 7)
  const inicio = `${mes}-01T03:00:00Z` // 00:00 em São Paulo
  const [a, m] = mes.split('-').map(Number)
  const fimMes = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) // último dia do mês

  // Tickets em que eu faço (qualquer situação), sem compras/reunião.
  const { data: tks, error } = await supabaseAdmin.from('tickets').select('id, numero, titulo, status, created_at, solicitante_id')
    .eq('responsavel_id', auth.userId).not('tipo', 'in', '(compras,reuniao)').limit(3000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lista = (tks || []) as { id: string; numero: number; titulo: string; status: string; created_at: string; solicitante_id: string }[]
  const chegaramL = lista.filter((t) => t.created_at >= inicio && t.solicitante_id !== auth.userId)

  // Eventos do mês nesses tickets (em lotes: a URL tem limite de tamanho).
  const ids = lista.map((t) => t.id)
  const concluidas = new Set<string>(), canceladas = new Set<string>(), contestadas = new Set<string>()
  for (let i = 0; i < ids.length; i += 150) {
    const { data: ev } = await supabaseAdmin.from('tickets_eventos').select('ticket_id, tipo, autor_id, payload')
      .in('ticket_id', ids.slice(i, i + 150)).in('tipo', ['status', 'comentario']).gte('created_at', inicio).limit(5000)
    for (const e of (ev || []) as { ticket_id: string; tipo: string; autor_id: string; payload: Record<string, unknown> | null }[]) {
      const p = e.payload || {}
      if (e.tipo === 'status' && (p.para === 'resolvido' || p.para === 'fechado')) concluidas.add(e.ticket_id)
      if (e.tipo === 'status' && p.para === 'cancelado') canceladas.add(e.ticket_id)
      if (e.tipo === 'comentario' && e.autor_id === auth.userId && String(p.texto || '').startsWith('Contestou a tarefa')) contestadas.add(e.ticket_id)
    }
  }
  // Listas para o clique nos cartões (a tela abre a lista e cada item abre o pedido).
  const porId = new Map(lista.map((t) => [t.id, t]))
  const resumo = (ids: Iterable<string>) => [...ids].map((id) => porId.get(id)).filter(Boolean)
    .map((t) => ({ id: t!.id, numero: t!.numero, titulo: t!.titulo, status: t!.status }))
    .sort((a, b) => b.numero - a.numero)
  return NextResponse.json({
    mes, fimMes,
    chegaram: chegaramL.length, concluidas: concluidas.size, contestadas: contestadas.size, canceladas: canceladas.size,
    listas: {
      chegaram: resumo(chegaramL.map((t) => t.id)), concluidas: resumo(concluidas),
      contestadas: resumo(contestadas), canceladas: resumo(canceladas),
    },
  })
}
