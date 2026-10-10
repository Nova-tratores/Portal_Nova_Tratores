// POPs — minhas execuções (GET) e iniciar uma execução avulsa (POST) (ticket tipo 'pop' na versão publicada vigente).
// POST /api/pops/execucoes { pop_id, responsavel_id?, ref_externa?, prazo?, visibilidade? }
// Quem pode: podeExecutar (pops:executar, editores e aprovadores da área, admin).
// O solicitante é quem iniciou; o responsável (quem executa) padrão é ele mesmo.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { carregarTicket, notificarTicket } from '@/lib/tickets/server'
import { atorDe, carregarPop, erro, erroBanco, rpc, usuarioAtivo } from '@/lib/pops/server'
import { podeExecutar, uuidValido } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/pops/execucoes[?encerradas=1]  — minhas execuções (sou o responsável ou
// participo), com o andamento. Quem só executa pode não ter a Central de Trabalho.
export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  try {
    const encerradas = req.nextUrl.searchParams.get('encerradas') === '1'
    const { data: parts } = await supabaseAdmin.from('tickets_participantes').select('ticket_id')
      .eq('user_id', auth.userId).is('removido_em', null).limit(1000)
    const ids = (parts || []).map((p) => p.ticket_id as string)
    let q = supabaseAdmin.from('tickets')
      .select('id, numero, titulo, status, prazo, responsavel_id, solicitante_id, payload, created_at, resolvido_em')
      .eq('tipo', 'pop').order('created_at', { ascending: false }).limit(200)
    q = ids.length ? q.or(`responsavel_id.eq.${auth.userId},id.in.(${ids.join(',')})`) : q.eq('responsavel_id', auth.userId)
    q = encerradas
      ? q.in('status', ['resolvido', 'fechado', 'cancelado'])
      : q.not('status', 'in', '(resolvido,fechado,cancelado)')
    const { data, error } = await q
    if (error) return erroBanco(error)
    const lista = data || []
    const tids = lista.map((t) => t.id)
    const [exs, resps] = tids.length ? await Promise.all([
      supabaseAdmin.from('pops_execucoes').select('ticket_id, versao_id, ref_externa, data_referencia').in('ticket_id', tids),
      supabaseAdmin.from('pops_execucao_respostas').select('ticket_id').in('ticket_id', tids).limit(5000),
    ]) : [{ data: [] }, { data: [] }]
    const vids = [...new Set((exs.data || []).map((e) => e.versao_id as string))]
    const passos = vids.length
      ? (await supabaseAdmin.from('pops_passos').select('versao_id, tipo').in('versao_id', vids).neq('tipo', 'instrucao').limit(5000)).data || []
      : []
    const respondidos = new Map<string, number>()
    for (const r of resps.data || []) respondidos.set(r.ticket_id as string, (respondidos.get(r.ticket_id as string) || 0) + 1)
    return NextResponse.json({
      execucoes: lista.map((t) => {
        const ex = (exs.data || []).find((e) => e.ticket_id === t.id)
        return {
          ...t, ref_externa: ex?.ref_externa || null, data_referencia: ex?.data_referencia || null,
          respondidos: respondidos.get(t.id) || 0,
          total: ex ? passos.filter((p) => p.versao_id === ex.versao_id).length : 0,
        }
      }),
    })
  } catch (e) {
    return erroBanco(e)
  }
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  try {
    const popId = String(body.pop_id || '')
    if (!uuidValido(popId)) return erro('POP não encontrado', 404)
    const ator = await atorDe(auth)
    const pop = await carregarPop(popId)
    if (!pop) return erro('POP não encontrado', 404)
    if (!podeExecutar(ator, pop)) return erro('Você não tem permissão para executar este POP.', 403)

    const responsavel = body.responsavel_id ? String(body.responsavel_id) : auth.userId
    if (!uuidValido(responsavel) || !(await usuarioAtivo(responsavel))) return erro('Responsável inválido ou inativo.')
    const prazo = body.prazo ? String(body.prazo) : null
    if (prazo && !/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return erro('Prazo inválido.')
    const ref = body.ref_externa ? String(body.ref_externa).trim().slice(0, 80) : null

    const ticketId = await rpc<string | null>('pops_criar_execucao', {
      p_pop: popId, p_solicitante: auth.userId, p_responsavel: responsavel,
      p_prazo: prazo, p_ref_externa: ref, p_agendamento: null, p_data_referencia: null,
      p_visibilidade: body.visibilidade === 'publico' ? 'publico' : 'privado',
    })
    if (!ticketId) return erro('Não foi possível criar a execução.', 500)
    if (responsavel !== auth.userId) {
      const t = await carregarTicket(ticketId)
      if (t) await notificarTicket(t.ticket, [responsavel], auth.userId, `Executar ${pop.codigo}: ${pop.titulo}`,
        ref ? `Referência: ${ref}` : 'Você é o responsável por esta execução.', 'tarefa_nova')
    }
    return NextResponse.json({ ticket_id: ticketId }, { status: 201 })
  } catch (e) {
    return erroBanco(e)
  }
}
