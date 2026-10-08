// CENTRAL DE TRABALHO — Fila de uma pessoa (ordem de trabalho → previsão).
// GET /api/trabalho/fila[?user=<uuid>]  → tickets da fila + ordem + feriados
// PUT /api/trabalho/fila  { user?, ordem: string[] }  → grava a ordem
// Quem VÊ: a própria pessoa, o admin e quem pediu algum ticket em aberto para
// ela (para saber quando o seu pedido sai). Ticket dela que o visitante não
// pode ver aparece como "Outro compromisso" (horas ocupadas, sem título).
// Quem MEXE na ordem: a própria pessoa e o admin. As regras
// de ordem e de encaixe ficam em lib/trabalho/fila.ts (o cliente recalcula a
// previsão na hora, ao arrastar).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { feriadosNacionais, feriadosExtras } from '@/lib/assistente/horario'
import { hojeSP } from '@/lib/trabalho/cronograma-server'
import { CAPACIDADE_PADRAO } from '@/lib/trabalho/fila'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Resolvido já foi feito: sai da fila (fica só esperando quem pediu confirmar).
const FORA = '(resolvido,fechado,cancelado)'
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const uuid = (x: unknown) => /^[0-9a-f-]{36}$/i.test(String(x || ''))

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const pedido = req.nextUrl.searchParams.get('user')
  const user = pedido && uuid(pedido) ? pedido : auth.userId
  // Pessoas cuja fila eu posso ver: eu + quem recebeu pedido meu em aberto (admin: todos).
  const { data: meusPedidos } = await supabaseAdmin.from('tickets').select('responsavel_id')
    .eq('solicitante_id', auth.userId).neq('responsavel_id', auth.userId).not('status', 'in', FORA).limit(500)
  const pedidosPara = new Set((meusPedidos || []).map((t) => t.responsavel_id as string))
  if (user !== auth.userId && !auth.isAdmin && !pedidosPara.has(user)) {
    return erro('Você só vê a fila de quem recebeu um pedido seu em aberto.', 403)
  }

  const [tks, plano] = await Promise.all([
    supabaseAdmin.from('tickets').select('*').eq('responsavel_id', user).neq('tipo', 'compras').not('status', 'in', FORA).limit(300),
    supabaseAdmin.from('tickets_plano').select('ticket_id, posicao').eq('user_id', user),
  ])
  if (tks.error) return erro(tks.error.message, 500)
  // Visitante (nem dono nem admin): o que não é dele nem público vira "Outro compromisso".
  const dono = user === auth.userId || auth.isAdmin
  let participo = new Set<string>()
  if (!dono && (tks.data || []).length) {
    const { data: ps } = await supabaseAdmin.from('tickets_participantes').select('ticket_id')
      .eq('user_id', auth.userId).is('removido_em', null).in('ticket_id', (tks.data || []).map((t) => t.id))
    participo = new Set((ps || []).map((x) => x.ticket_id as string))
  }
  const tickets = (tks.data || []).map((t) => {
    if (dono || t.solicitante_id === auth.userId || participo.has(t.id) || t.visibilidade === 'publico') return t
    const pl = (t.payload || {}) as Record<string, unknown>
    return {
      ...t, titulo: 'Outro compromisso', descricao: '', categoria: '', terceiro_envolvido: '', numero: 0,
      quadro_id: null, solicitante_id: user, oculto: true,
      payload: { inicio: pl.inicio, dias: pl.dias, horas_dia: pl.horas_dia, urgente: pl.urgente },
    }
  })

  const idsQuadros = [...new Set(tickets.map((t) => t.quadro_id).filter(Boolean))] as string[]
  const idsUsuarios = [...new Set(tickets.map((t) => t.solicitante_id).concat(user))]
  const [qs, us, pessoas] = await Promise.all([
    idsQuadros.length ? supabaseAdmin.from('tickets_quadros').select('id, nome, cor').in('id', idsQuadros) : Promise.resolve({ data: [] }),
    supabaseAdmin.from('financeiro_usu').select('id, nome, avatar_url').in('id', idsUsuarios),
    // De quem dá para ver a fila: admin = todos ativos; os outros = eu + quem recebeu pedido meu.
    auth.isAdmin
      ? supabaseAdmin.from('financeiro_usu').select('id, nome, ativo').order('nome')
      : supabaseAdmin.from('financeiro_usu').select('id, nome, ativo').in('id', [auth.userId, ...pedidosPara]).order('nome'),
  ])
  const quadros: Record<string, { id: string; nome: string; cor: string }> = {}
  for (const q of (qs.data || []) as { id: string; nome: string; cor: string }[]) quadros[q.id] = q
  const usuarios: Record<string, { id: string; nome: string; avatar_url: string | null }> = {}
  for (const u of (us.data || []) as { id: string; nome: string; avatar_url: string | null }[]) usuarios[u.id] = u

  const hoje = hojeSP()
  const ano = Number(hoje.slice(0, 4))
  const feriados = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1), ...feriadosExtras()]

  return NextResponse.json({
    user, eu: auth.userId, hoje, podeOrdenar: dono, capacidade: CAPACIDADE_PADRAO, feriados,
    tickets, quadros, usuarios,
    posicao: Object.fromEntries((plano.data || []).map((p) => [p.ticket_id, p.posicao])),
    pessoas: ((pessoas.data || []) as { id: string; nome: string; ativo?: boolean }[]).filter((p) => p.ativo !== false).map((p) => ({ id: p.id, nome: p.nome })),
  })
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const user = uuid(body.user) ? String(body.user) : auth.userId
  if (user !== auth.userId && !auth.isAdmin) return erro('Só a própria pessoa ou o admin mexe nesta fila.', 403)
  if (!Array.isArray(body.ordem)) return erro('Mande a ordem')
  const unicos = [...new Set((body.ordem as unknown[]).map(String).filter(uuid))].slice(0, 300)

  // Só entra o que é da fila dessa pessoa (ticket transferido no meio do caminho cai fora).
  const { data: validos } = unicos.length
    ? await supabaseAdmin.from('tickets').select('id').in('id', unicos).eq('responsavel_id', user).not('status', 'in', '(fechado,cancelado)')
    : { data: [] }
  const ok = new Set((validos || []).map((t) => t.id))
  const ordem = unicos.filter((id) => ok.has(id))
  const agora = new Date().toISOString()
  if (ordem.length) {
    const { error } = await supabaseAdmin.from('tickets_plano')
      .upsert(ordem.map((ticket_id, i) => ({ user_id: user, ticket_id, posicao: i, updated_at: agora })), { onConflict: 'user_id,ticket_id' })
    if (error) return erro(error.message, 500)
  }
  return NextResponse.json({ ok: true })
}
