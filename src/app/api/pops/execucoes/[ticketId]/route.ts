// POPs — uma execução (ticket tipo 'pop').
// GET  /api/pops/execucoes/:ticketId   execução + versão exata + passos + respostas (URLs assinadas)
// POST /api/pops/execucoes/:ticketId { acao, ... }
//   upload_url { passo_id, content_type }   URL assinada para a foto subir direto no bucket privado
//   responder  { passo_id, valor, fotos }   salva UM passo na hora (pode refazer)
//   encerrar                                estágio 1 (resolvido) — só com os obrigatórios completos
// Ver: quem vê o ticket. Responder: responsável, participante ativo ou admin.
// Encerrar: responsável ou admin. Fechar (estágio 2) segue o motor de tickets.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  camposDoStatus, carregarTicket, ehParticipanteAtivo, notificarTicket, podeVerTicket, registrarEvento,
  type TicketCarregado,
} from '@/lib/tickets/server'
import { STATUS_FINAIS } from '@/lib/tickets/constantes'
import {
  BUCKET_EXECUCAO, BUCKET_MIDIA, carregarExecucao, carregarPop, erro, erroBanco, passosDaVersao,
  respostasDaExecucao, rpc, urlDeUpload, urlsAssinadas, usuariosMin, atorDe,
} from '@/lib/pops/server'
import { ehAdminPops, normalizarResposta, pendentes, uuidValido, type Passo, type Resposta } from '@/lib/pops/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function carregar(ticketId: string, auth: Autenticado): Promise<TicketCarregado | Response> {
  if (!uuidValido(ticketId)) return erro('Execução não encontrada', 404)
  const c = await carregarTicket(ticketId)
  if (!c || c.ticket.tipo !== 'pop') return erro('Execução não encontrada', 404)
  if (!(await podeVerTicket(c.ticket, c.participantes, auth))) return erro('Execução não encontrada', 404)
  return c
}

const podeResponder = (c: TicketCarregado, auth: Autenticado, admin: boolean) =>
  admin || c.ticket.responsavel_id === auth.userId || ehParticipanteAtivo(c.participantes, auth.userId)

export async function GET(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const { ticketId } = await params
  try {
    const c = await carregar(ticketId, auth)
    if (c instanceof Response) return c
    const ex = await carregarExecucao(ticketId)
    if (!ex) return erro('Execução sem vínculo com POP.', 409)
    const [pop, versao, passos, respostas, ator] = await Promise.all([
      carregarPop(ex.pop_id),
      supabaseAdmin.from('pops_versoes').select('id, numero, estado, objetivo, escopo, materiais, publicado_em')
        .eq('id', ex.versao_id).single().then((r) => r.data),
      passosDaVersao(ex.versao_id),
      respostasDaExecucao(ticketId),
      atorDe(auth),
    ])
    const fotos = respostas.flatMap((r) => [...(r.fotos || []), ...(r.valor?.imagem_path ? [r.valor.imagem_path] : [])])
    const [urlsFotos, urlsMidia, usuarios] = await Promise.all([
      urlsAssinadas(BUCKET_EXECUCAO, fotos),
      urlsAssinadas(BUCKET_MIDIA, passos.map((p) => p.midia_path as string)),
      usuariosMin([c.ticket.solicitante_id, c.ticket.responsavel_id, ...respostas.map((r) => r.respondido_por)]),
    ])
    const falta = pendentes(passos as Passo[], respostas as Resposta[]).map((p) => p.id)
    const admin = ehAdminPops(ator)
    return NextResponse.json({
      ticket: c.ticket, execucao: ex, pop, versao,
      passos: passos.map((p) => ({ ...p, midia_url: p.midia_path ? urlsMidia[p.midia_path as string] || null : null })),
      respostas, fotos_url: urlsFotos, pendentes: falta, usuarios,
      // Versão vigente mudou depois que esta execução começou? (a execução continua na dela)
      versao_vigente_diferente: versao?.estado !== 'publicado',
      pode: {
        responder: podeResponder(c, auth, admin) && !['resolvido', ...STATUS_FINAIS].includes(c.ticket.status),
        encerrar: (admin || c.ticket.responsavel_id === auth.userId) && !['resolvido', ...STATUS_FINAIS].includes(c.ticket.status),
      },
    })
  } catch (e) {
    return erroBanco(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  const { ticketId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const acao = String(body.acao || '')
  try {
    const c = await carregar(ticketId, auth)
    if (c instanceof Response) return c
    const admin = ehAdminPops(await atorDe(auth))
    const encerrada = ['resolvido', ...STATUS_FINAIS].includes(c.ticket.status)
    const ex = await carregarExecucao(ticketId)
    if (!ex) return erro('Execução sem vínculo com POP.', 409)

    const passoDoCorpo = async () => {
      const pid = String(body.passo_id || '')
      if (!uuidValido(pid)) return null
      const { data } = await supabaseAdmin.from('pops_passos').select('*').eq('id', pid).eq('versao_id', ex.versao_id).maybeSingle()
      return data as Passo | null
    }

    // ---------------------------------------------------------------- upload
    if (acao === 'upload_url') {
      if (!podeResponder(c, auth, admin)) return erro('Você não participa desta execução.', 403)
      if (encerrada) return erro('Execução encerrada — reabra para mudar respostas.', 409)
      const p = await passoDoCorpo()
      if (!p || (p.tipo !== 'foto' && p.tipo !== 'assinatura')) return erro('Passo não recebe arquivo.')
      const up = await urlDeUpload(BUCKET_EXECUCAO, `${ticketId}/${p.id}`, String(body.content_type || ''))
      return NextResponse.json(up)
    }

    // ---------------------------------------------------------------- responder
    if (acao === 'responder') {
      if (!podeResponder(c, auth, admin)) return erro('Você não participa desta execução.', 403)
      if (encerrada) return erro('Execução encerrada — reabra para mudar respostas.', 409)
      const p = await passoDoCorpo()
      if (!p) return erro('Passo não encontrado nesta versão.', 404)
      const n = normalizarResposta(p, body.valor, body.fotos, `${ticketId}/${p.id}/`)
      if ('erro' in n) return erro(n.erro)
      const r = await rpc<{ fora_faixa: boolean; alerta_novo: boolean; pendentes: number }>('pops_responder', {
        p_ticket: ticketId, p_passo: p.id, p_valor: n.valor, p_fotos: n.fotos, p_autor: auth.userId,
      })
      if (r.alerta_novo) {
        const cfg = p.config || {}
        await notificarTicket(c.ticket, [c.ticket.solicitante_id], auth.userId,
          `Valor fora da faixa no #${c.ticket.numero}`,
          `${p.titulo}: ${String(n.valor.numero)}${cfg.unidade ? ' ' + cfg.unidade : ''} (faixa ${cfg.min ?? '—'} a ${cfg.max ?? '—'})`)
      }
      return NextResponse.json(r)
    }

    // ---------------------------------------------------------------- encerrar (estágio 1)
    if (acao === 'encerrar') {
      if (!admin && c.ticket.responsavel_id !== auth.userId) return erro('Só quem executa (ou o admin) encerra.', 403)
      if (encerrada) return erro('Execução já encerrada.', 409)
      const falta = await rpc<number>('pops_execucao_pendentes', { p_ticket: ticketId })
      if (falta > 0) return erro(`Faltam ${falta} passo(s) obrigatório(s).`, 400, { pendentes: falta })
      const { error } = await supabaseAdmin.from('tickets').update(camposDoStatus('resolvido')).eq('id', ticketId)
      if (error) return erroBanco(error)   // o trigger do banco é a última barreira
      await registrarEvento(ticketId, auth.userId, 'status', { de: c.ticket.status, para: 'resolvido' })
      await notificarTicket(c.ticket, [c.ticket.solicitante_id], auth.userId,
        `Execução #${c.ticket.numero} concluída`, c.ticket.titulo, 'ticket_concluido')
      return NextResponse.json({ ok: true })
    }

    return erro('Ação desconhecida.')
  } catch (e) {
    return erroBanco(e)
  }
}
