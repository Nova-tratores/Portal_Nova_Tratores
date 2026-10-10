// POPs — decisão da revisão (ticket tipo 'pop_revisao', a "bola" é o aprovador).
// POST /api/pops/revisao/:ticketId { acao: 'aprovar' | 'reprovar', parecer? }
//   aprovar  → publica a versão; a publicada anterior vira obsoleta; ticket fecha.
//   reprovar → versão volta a rascunho (parecer obrigatório); ticket fecha.
// Quem decide: o responsável do ticket (aprovador escolhido na submissão) ou o
// admin do módulo. O ator vem SEMPRE da sessão.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { carregarTicket, envolvidos, notificarTicket, podeVerTicket } from '@/lib/tickets/server'
import { atorDe, carregarPop, carregarVersao, erro, erroBanco, rpc } from '@/lib/pops/server'
import { ehAdminPops, uuidValido } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const { ticketId } = await params
  if (!uuidValido(ticketId)) return erro('Revisão não encontrada', 404)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const acao = String(body.acao || '')
  if (acao !== 'aprovar' && acao !== 'reprovar') return erro('Ação desconhecida.')

  try {
    const c = await carregarTicket(ticketId)
    if (!c || c.ticket.tipo !== 'pop_revisao') return erro('Revisão não encontrada', 404)
    if (!(await podeVerTicket(c.ticket, c.participantes, auth))) return erro('Revisão não encontrada', 404)
    const ator = await atorDe(auth)
    if (c.ticket.responsavel_id !== auth.userId && !ehAdminPops(ator)) {
      return erro('Só o aprovador designado (ou o admin do módulo) decide esta revisão.', 403)
    }
    const versaoId = String((c.ticket.payload as Record<string, unknown>).versao_id || '')
    if (!uuidValido(versaoId)) return erro('Revisão sem versão vinculada.', 409)
    // Ninguém aprova a própria versão — nem o admin (decisão do Gate 2).
    const v = await carregarVersao(versaoId)
    if (acao === 'aprovar' && (v?.submetido_por === auth.userId || c.ticket.solicitante_id === auth.userId)) {
      return erro('Você enviou esta versão — outra pessoa precisa aprovar.', 403)
    }
    const parecer = String(body.parecer || '').trim().slice(0, 2000)
    if (acao === 'reprovar' && !parecer) return erro('Diga o motivo da reprovação.')

    const r = await rpc<{ pop_id: string; numero: number; submetido_por: string | null }>('pops_decidir_revisao', {
      p_versao: versaoId, p_aprovador: auth.userId, p_aprovar: acao === 'aprovar', p_parecer: parecer || null,
    })
    const pop = await carregarPop(r.pop_id)
    await notificarTicket({ ...c.ticket, status: 'fechado' }, [...envolvidos(c.ticket, c.participantes), r.submetido_por || ''],
      auth.userId,
      acao === 'aprovar'
        ? `${pop?.codigo} v${r.numero} publicado`
        : `${pop?.codigo} v${r.numero} voltou para ajustes`,
      parecer || pop?.titulo || '', 'ticket_concluido')
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return erroBanco(e)
  }
}
