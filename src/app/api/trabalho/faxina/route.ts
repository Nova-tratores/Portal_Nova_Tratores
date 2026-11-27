// FAXINA DOS PARADOS (melhorias-central-de-trabalho.md · 1.2, 24/11/2026).
// GET  /api/trabalho/faxina[?contar=1] -> os pedidos da pessoa (faz OU pediu) parados há 30+ dias
//                                         ou vencidos há 15+ dias, o mais velho primeiro
// POST /api/trabalho/faxina { acao:'topo', ticket_id } -> "Fazer agora": topo da fila de quem faz
// As outras ações da Faxina usam as rotas de sempre (/api/tickets/[id]/acoes: editar prazo,
// transferir, comentar, status), então seguem as mesmas regras e caem na timeline.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets, registrarEvento } from '@/lib/tickets/server'
import { hojeSP } from '@/lib/trabalho/cronograma-server'
import { colocarNoTopoDaFila } from '@/lib/trabalho/fila-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const DIAS_PARADO = 30
const DIAS_VENCIDO = 15
const menosDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const hoje = hojeSP()
  const paradoDesde = new Date(Date.now() - DIAS_PARADO * 86400000).toISOString()
  const vencidoAntes = menosDias(hoje, DIAS_VENCIDO)
  const contar = req.nextUrl.searchParams.get('contar') === '1'
  // contar=1 (barra e Minha fila, 26/11/2026): só a contagem, sem trazer as linhas (máximo 200, como antes).
  let q = supabaseAdmin.from('tickets')
    .select('id, numero, titulo, descricao, prazo, status, responsavel_id, solicitante_id, ultima_atividade_em, created_at', contar ? { count: 'exact', head: true } : undefined)
    .or(`responsavel_id.eq.${auth.userId},solicitante_id.eq.${auth.userId}`)
    .not('tipo', 'in', '(compras,reuniao,pop_revisao)')
    .not('status', 'in', '(resolvido,fechado,cancelado)')
    .or(`ultima_atividade_em.lt.${paradoDesde},prazo.lt.${vencidoAntes}`)
  if (!contar) q = q.order('ultima_atividade_em', { ascending: true }).limit(200)
  const { data, error, count } = await q
  if (error) return erro(error.message, 500)
  if (contar) return NextResponse.json({ n: Math.min(200, count || 0) })
  const lista = data || []

  const ids = [...new Set(lista.flatMap((t) => [t.responsavel_id as string, t.solicitante_id as string]))]
  const { data: us } = ids.length ? await supabaseAdmin.from('financeiro_usu').select('id, nome').in('id', ids) : { data: [] }
  const nome = new Map(((us || []) as { id: string; nome: string }[]).map((u) => [u.id, u.nome]))
  const dias = (de: string, ate: string) => Math.max(0, Math.round((Date.parse(ate) - Date.parse(de)) / 86400000))
  return NextResponse.json({
    eu: auth.userId, admin: auth.isAdmin,
    itens: lista.map((t) => ({
      id: t.id, numero: t.numero, titulo: t.titulo, prazo: t.prazo, status: t.status,
      // "Dá pra ver nada" (José, 26/11/2026): a Faxina mostra o que foi pedido e quando.
      descricao: String(t.descricao || '').slice(0, 600), criado: t.created_at,
      responsavel_id: t.responsavel_id, solicitante_id: t.solicitante_id,
      responsavel: nome.get(t.responsavel_id as string) || '—', solicitante: nome.get(t.solicitante_id as string) || '—',
      parado: dias(String(t.ultima_atividade_em || t.created_at), new Date().toISOString()),
      vencido: t.prazo && t.prazo < hoje ? dias(t.prazo + 'T12:00:00Z', hoje + 'T12:00:00Z') : 0,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (body.acao !== 'topo') return erro('Ação desconhecida')
  const id = String(body.ticket_id || '')
  const { data: t } = await supabaseAdmin.from('tickets').select('id, responsavel_id').eq('id', id).maybeSingle()
  if (!t) return erro('Pedido não encontrado', 404)
  if (t.responsavel_id !== auth.userId) return erro('Só quem faz o pedido pode pô-lo no topo da própria fila.', 403)
  await colocarNoTopoDaFila(auth.userId, id)
  // Timeline (append-only): reaproveita o tipo "edicao", com a origem "faxina".
  await registrarEvento(id, auth.userId, 'edicao', { campo: 'fila', para: 'topo', origem: 'faxina' })
  await supabaseAdmin.from('tickets').update({ ultima_atividade_em: new Date().toISOString() }).eq('id', id)
  return NextResponse.json({ ok: true })
}
