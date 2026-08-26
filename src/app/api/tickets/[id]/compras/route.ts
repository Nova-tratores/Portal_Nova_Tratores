// Solicitação de Compras — ações do trilho de alçadas (service role).
// POST /api/tickets/:id/compras  { acao, ...campos }
//
// Ações: alterar_qtd | devolver | reenviar | aprovar | reprovar | emitir_pc | cancelar
//
// Cada ação: (1) confere tipo='compras' e a etapa de origem; (2) confere que o
// ator é a pessoa fixa da etapa (config) ou admin; (3) valida o texto obrigatório
// (justificativa/parecer — gravado para sempre na timeline imutável); (4) atualiza
// payload + sc_etapa + status + responsavel_id (a "bola"); (5) registra o evento;
// (6) garante o novo ator como participante (o vendedor nunca sai — ADR-002);
// (7) notifica a próxima etapa + o vendedor.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloTickets, carregarTicket, podeVer, garantirParticipante,
  registrarEvento, notificarTicket, envolvidos,
} from '@/lib/tickets/server'
import type { EventoTipo } from '@/lib/tickets/constantes'
import {
  SC_TRANSICOES, SC_ETAPA_INFO, proximoResponsavel, podeExecutarAuth,
  type PayloadSC, type ScAcao, type ScEtapa,
} from '@/lib/tickets/compras'
import { avaliarBloqueio, carregarConfigCompras } from '@/lib/tickets/compras-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function erro(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function nomeDe(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return data?.nome || 'alguém'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const acao = String(body.acao || '') as ScAcao

  const carregado = await carregarTicket(id)
  if (!carregado) return erro('Ticket não encontrado', 404)
  const { ticket, participantes } = carregado
  if (!podeVer(ticket, participantes, auth)) return erro('Ticket não encontrado', 404)
  if (ticket.tipo !== 'compras') return erro('Este ticket não é uma Solicitação de Compras.')

  const etapa = (ticket.sc_etapa || '') as ScEtapa
  const transicoes = SC_TRANSICOES[etapa] || []
  const transicao = transicoes.find((t) => t.acao === acao)
  if (!transicao) return erro(`Ação indisponível na etapa atual (${SC_ETAPA_INFO[etapa]?.label || etapa}).`)

  const config = await carregarConfigCompras()
  if (!podeExecutarAuth(transicao, auth, config, ticket.solicitante_id)) {
    return erro('Você não tem o papel necessário para esta ação.', 403)
  }

  const texto = String(body.texto || body.justificativa || body.parecer || body.motivo || '').trim()
  if (transicao.exigeTexto && !texto) return erro('Esta ação exige uma justificativa/parecer por escrito.')

  const payload: PayloadSC = { ...(ticket.payload as PayloadSC) }
  let evento: EventoTipo = 'status'
  let eventoPayload: Record<string, unknown> = {}
  let notifTitulo = ''
  let notifDescricao = texto || ticket.titulo
  const autor = await nomeDe(auth.userId)

  // ------------------------------------------------------------- ações
  if (acao === 'alterar_qtd') {
    const qtd = Number(body.quantidade_aprovada)
    if (!Number.isFinite(qtd) || qtd <= 0) return erro('Informe a quantidade aprovada')
    const de = payload.quantidade_aprovada ?? payload.quantidade_solicitada
    payload.quantidade_aprovada = qtd
    if (body.valor_unitario != null && body.valor_unitario !== '') payload.valor_unitario = Number(body.valor_unitario)
    const unit = Number(payload.valor_unitario ?? payload.preco_alvo ?? 0)
    payload.valor_total = qtd * unit
    payload.bloqueio = await avaliarBloqueio(payload, config)
    evento = 'qtd_alterada'
    eventoPayload = { de, para: qtd, justificativa: texto }
    notifTitulo = `SC #${ticket.numero}: quantidade definida (${qtd})`
  } else if (acao === 'devolver') {
    // diretoria→vendedor ou comprador→financeiro
    evento = etapa === 'diretoria' ? 'qtd_alterada' : 'parecer_financeiro'
    eventoPayload = etapa === 'diretoria' ? { devolvido: true, justificativa: texto } : { devolucao: true, texto }
    notifTitulo = `SC #${ticket.numero} devolvida por ${autor}`
  } else if (acao === 'reenviar') {
    evento = 'sc_criada'
    eventoPayload = { reenvio: true }
    notifTitulo = `SC #${ticket.numero} reenviada à Diretoria`
  } else if (acao === 'aprovar') {
    const decisao = body.decisao === 'ressalva' ? 'ressalva' : 'aprovado'
    if (body.prazo_compromisso) payload.prazo_compromisso = String(body.prazo_compromisso)
    evento = 'parecer_financeiro'
    eventoPayload = { decisao, texto, ...(payload.prazo_compromisso ? { prazo_compromisso: payload.prazo_compromisso } : {}) }
    notifTitulo = `SC #${ticket.numero} ${decisao === 'ressalva' ? 'aprovada com ressalva' : 'aprovada'} pelo Financeiro`
  } else if (acao === 'reprovar') {
    evento = 'parecer_financeiro'
    eventoPayload = { decisao: 'reprovado', texto }
    notifTitulo = `SC #${ticket.numero} reprovada pelo Financeiro`
  } else if (acao === 'emitir_pc') {
    const pedido = String(body.pedido_omie_numero || '').trim()
    if (!pedido) return erro('Informe o nº do Pedido de Compra no Omie')
    payload.pedido_omie_numero = pedido
    evento = 'pc_emitido'
    eventoPayload = { pedido_omie_numero: pedido, ...(texto ? { condicoes: texto } : {}) }
    notifTitulo = `SC #${ticket.numero}: Pedido de Compra ${pedido} emitido`
    notifDescricao = 'A solicitação foi concluída com a emissão do PC.'
  } else if (acao === 'cancelar') {
    evento = 'status'
    eventoPayload = { de: ticket.status, para: 'cancelado', ...(texto ? { motivo: texto } : {}) }
    notifTitulo = `SC #${ticket.numero} cancelada por ${autor}`
  }

  const para = transicao.para
  const info = SC_ETAPA_INFO[para]
  const novoResponsavel = proximoResponsavel(para, config, ticket.solicitante_id)

  const patch: Record<string, unknown> = {
    sc_etapa: para,
    status: info.status,
    responsavel_id: novoResponsavel,
    payload,
  }
  if (para === 'concluida') patch.resolvido_em = new Date().toISOString()
  if (para === 'concluida' || para === 'cancelada') patch.fechado_em = new Date().toISOString()

  const { error } = await supabaseAdmin.from('tickets').update(patch).eq('id', id)
  if (error) return erro(error.message, 500)

  // Etapas terminais saem da fila pessoal de todos.
  if (para === 'concluida' || para === 'cancelada') {
    await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', id)
  } else if (novoResponsavel !== ticket.responsavel_id) {
    await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', id).eq('user_id', ticket.responsavel_id)
  }

  const errEvento = await registrarEvento(id, auth.userId, evento, eventoPayload)
  if (errEvento) return erro(errEvento, 500)

  // O novo ator entra como participante; o vendedor (solicitante) nunca sai.
  if (novoResponsavel && novoResponsavel !== ticket.responsavel_id) {
    await garantirParticipante(id, novoResponsavel, auth.userId)
  }

  const alvo = [...new Set([...envolvidos(ticket, participantes), novoResponsavel])]
  await notificarTicket({ ...ticket, responsavel_id: novoResponsavel }, alvo, auth.userId, notifTitulo, notifDescricao)

  return NextResponse.json({ ok: true })
}
