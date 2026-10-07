// CENTRAL DE TRABALHO — Cronograma GERAL: tudo que eu posso ver, por dia,
// cada ticket na cor do seu bloco.
// GET /api/trabalho/cronograma-geral ->
//   tickets em aberto (não resolvidos) em que:
//     - eu pedi, eu faço ou participo; ou
//     - estão num bloco que eu vejo E foram compartilhados com o bloco; ou
//     - estão fora de bloco e são "visível a todos".
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { listarQuadros } from '@/lib/tickets/quadros-server'
import type { Ticket } from '@/lib/tickets/constantes'
import { contagemPassos } from '@/lib/trabalho/tarefas-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FORA = '(resolvido,fechado,cancelado)'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { data: parts } = await supabaseAdmin.from('tickets_participantes').select('ticket_id')
    .eq('user_id', auth.userId).is('removido_em', null).limit(1000)
  const idsParticipo = (parts || []).map((p) => p.ticket_id)

  // Blocos que eu vejo (admin vê todos — aqui só contam os meus e os públicos,
  // pra o cronograma de quem é admin não virar o da empresa inteira).
  let quadrosVistos: { id: string; nome: string; cor: string; meu?: boolean; visibilidade: string }[] = []
  try { quadrosVistos = (await listarQuadros(auth, false)).filter((q) => q.meu || q.visibilidade === 'publico') }
  catch { /* sem a migration dos quadros: só os tickets meus */ }
  const idsBlocos = quadrosVistos.map((q) => q.id)

  const ors = [
    `solicitante_id.eq.${auth.userId}`,
    `responsavel_id.eq.${auth.userId}`,
    'and(quadro_id.is.null,visibilidade.eq.publico)',
  ]
  if (idsParticipo.length) ors.push(`id.in.(${idsParticipo.join(',')})`)
  if (idsBlocos.length) ors.push(`and(visibilidade.eq.publico,quadro_id.in.(${idsBlocos.join(',')}))`)

  const { data, error } = await supabaseAdmin.from('tickets').select('*')
    .or(ors.join(','))
    .neq('tipo', 'compras')
    .not('status', 'in', FORA)
    .order('prazo', { ascending: true, nullsFirst: false })
    .limit(800)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const tickets = (data || []) as Ticket[]

  // Cor/nome do bloco de cada ticket (inclui blocos de outros em que estou no ticket)
  const quadros: Record<string, { id: string; nome: string; cor: string }> = {}
  for (const q of quadrosVistos) quadros[q.id] = { id: q.id, nome: q.nome, cor: q.cor }
  const faltam = [...new Set(tickets.map((t) => t.quadro_id).filter((x) => x && !quadros[x]))] as string[]
  if (faltam.length) {
    const { data: qs } = await supabaseAdmin.from('tickets_quadros').select('id, nome, cor').in('id', faltam)
    for (const q of qs || []) quadros[q.id] = q
  }

  const idsUsuarios = [...new Set(tickets.flatMap((t) => [t.solicitante_id, t.responsavel_id]))]
  const [us, passos] = await Promise.all([
    idsUsuarios.length ? supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', idsUsuarios) : Promise.resolve({ data: [] }),
    contagemPassos(tickets.map((t) => t.id)),
  ])
  const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of (us.data || []) as { id: string; nome: string; avatar_url: string | null }[]) usuarios[u.id] = u

  return NextResponse.json({ tickets, quadros, usuarios, passos, eu: auth.userId })
}
