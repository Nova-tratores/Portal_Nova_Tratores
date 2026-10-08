// CENTRAL DE TRABALHO — o que a página dos Quadros mostra além dos blocos.
// GET /api/trabalho/central ->
//   praOrganizar: tickets que EU recebi e ainda não estão em nenhum bloco
//   pedidos:      tickets que EU criei para outra pessoa (dia, situação, bloco)
//   paraTarefa:   tickets abertos que criei OU recebi (onde dá pra pôr tarefa)
//   envolvidos:   por ticket de paraTarefa, quem está nele (pedinte, quem faz e
//                 participantes) — a Nova tarefa mostra os tickets "em comum"
//   pendencias:   tarefas soltas (automáticas) em aberto atribuídas a mim
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { STATUS_FINAIS, type Ticket } from '@/lib/tickets/constantes'
import { contagemPassos } from '@/lib/trabalho/tarefas-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TicketCentral = Ticket & { aceite?: string | null; aceite_motivo?: string | null }

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const finais = `(${STATUS_FINAIS.join(',')})`
  const { data, error } = await supabaseAdmin.from('tickets').select('*')
    .or(`responsavel_id.eq.${auth.userId},solicitante_id.eq.${auth.userId}`)
    .neq('tipo', 'compras')
    .not('status', 'in', finais)
    .order('prazo', { ascending: true, nullsFirst: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const lista = (data || []) as TicketCentral[]

  const praOrganizar = lista.filter((t) => t.responsavel_id === auth.userId && !t.quadro_id && t.status !== 'resolvido' && t.aceite !== 'recusado')
  const pedidos = lista.filter((t) => t.solicitante_id === auth.userId && t.responsavel_id !== auth.userId)
  const paraTarefa = lista.filter((t) => t.status !== 'resolvido')

  const idsQuadro = [...new Set(lista.map((t) => t.quadro_id).filter(Boolean))] as string[]
  const idsColuna = [...new Set(pedidos.map((t) => t.quadro_coluna_id).filter(Boolean))] as string[]
  const idsUsuarios = [...new Set(lista.flatMap((t) => [t.solicitante_id, t.responsavel_id]))]
  const [qs, cols, us, passos, pend, parts] = await Promise.all([
    idsQuadro.length ? supabaseAdmin.from('tickets_quadros').select('id, nome, cor').in('id', idsQuadro) : Promise.resolve({ data: [] }),
    idsColuna.length ? supabaseAdmin.from('tickets_quadro_colunas').select('id, nome').in('id', idsColuna) : Promise.resolve({ data: [] }),
    idsUsuarios.length ? supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', idsUsuarios) : Promise.resolve({ data: [] }),
    contagemPassos(pedidos.map((t) => t.id)),
    supabaseAdmin.from('portal_tarefas').select('id', { count: 'exact', head: true })
      .eq('atribuido_a', auth.userId).is('ticket_id', null).eq('concluida', false),
    paraTarefa.length
      ? supabaseAdmin.from('tickets_participantes').select('ticket_id, user_id').in('ticket_id', paraTarefa.map((t) => t.id)).is('removido_em', null)
      : Promise.resolve({ data: [] }),
  ])
  const envolvidos: Record<string, string[]> = {}
  for (const t of paraTarefa) envolvidos[t.id] = [t.solicitante_id, t.responsavel_id]
  for (const x of (parts.data || []) as { ticket_id: string; user_id: string }[]) envolvidos[x.ticket_id]?.push(x.user_id)
  const quadros: Record<string, { id: string; nome: string; cor: string }> = {}
  for (const q of (qs.data || []) as { id: string; nome: string; cor: string }[]) quadros[q.id] = q
  const colunas: Record<string, string> = {}
  for (const c of (cols.data || []) as { id: string; nome: string }[]) colunas[c.id] = c.nome
  const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of (us.data || []) as { id: string; nome: string; avatar_url: string | null }[]) usuarios[u.id] = u

  return NextResponse.json({
    praOrganizar, pedidos, paraTarefa, envolvidos, quadros, colunas, usuarios, passos,
    pendencias: pend.count || 0,
  })
}
