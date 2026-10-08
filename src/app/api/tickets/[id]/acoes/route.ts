// Tickets — TODAS as mutações do ticket passam por aqui (service role).
// POST /api/tickets/:id/acoes  { acao, ...campos }
//
// Ações: comentar | anexar | transferir | status | pedir_atualizacao |
//        participante_add | participante_remover | visibilidade | editar |
//        vincular | desvincular (requisições — sql/tickets-vinculos.sql)
//
// Regras (conceito seções 3–4): responsável único; transferência direta sem
// aceite (responsável atual ou solicitante); timeline append-only; participante
// nunca sai como efeito colateral; cobrança ("pedir atualização") é pública.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  temModuloTickets, carregarTicket, podeVerTicket, ehParticipanteAtivo, envolvidos,
  garantirParticipante, registrarEvento, notificarTicket, validarTransicao, camposDoStatus,
  buscarRequisicaoResumo,
} from '@/lib/tickets/server'
import { STATUS_FINAIS, STATUS_INFO, type Ticket, type TicketParticipante, type TicketStatus } from '@/lib/tickets/constantes'
import { labelRequisicao } from '@/lib/tickets/vinculos'
import { carregarQuadro, papeis } from '@/lib/tickets/quadros-server'
import { colunaDoTicket } from '@/lib/tickets/quadros'
import { sincronizarEtapaDoTicket, moverEtapaDoTicket } from '@/lib/trabalho/cronograma-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function erro(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function ehEnvolvido(t: Ticket, participantes: TicketParticipante[], auth: Autenticado): boolean {
  return t.solicitante_id === auth.userId
    || t.responsavel_id === auth.userId
    || ehParticipanteAtivo(participantes, auth.userId)
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
  const acao = String(body.acao || '')

  const carregado = await carregarTicket(id)
  if (!carregado) return erro('Ticket não encontrado', 404)
  const { ticket, participantes } = carregado
  if (!(await podeVerTicket(ticket, participantes, auth))) return erro('Ticket não encontrado', 404)

  const encerrado = STATUS_FINAIS.includes(ticket.status)
  const souResponsavel = ticket.responsavel_id === auth.userId
  const souSolicitante = ticket.solicitante_id === auth.userId
  const todos = envolvidos(ticket, participantes)

  // Bloco (quadro) de quem RECEBEU + privacidade, escolhidos ao confirmar ou
  // depois em "Pra organizar". Devolve mensagem de erro ou null.
  // quadro_id: undefined = não mexe · null = tira do bloco · uuid = põe no bloco.
  const organizar = async (quadroId: string | null | undefined, vis: unknown): Promise<string | null> => {
    const patch: Record<string, unknown> = {}
    const evento: Record<string, unknown> = {}
    if (quadroId !== undefined && quadroId !== (ticket.quadro_id || null)) {
      const nomeAntes = ticket.quadro_id ? (await carregarQuadro(ticket.quadro_id))?.quadro.nome ?? null : null
      if (quadroId === null) {
        // Todo ticket fica num bloco (Central de Trabalho): não dá para tirar.
        return 'Todo ticket precisa ficar num bloco — escolha outro bloco em vez de tirar.'
      } else {
        const destino = await carregarQuadro(quadroId)
        if (!destino || destino.quadro.arquivado) return 'Bloco não encontrado.'
        if (!papeis(destino, auth).trabalhar) return 'Você não participa deste bloco.'
        patch.quadro_id = quadroId
        patch.quadro_coluna_id = colunaDoTicket(null, destino.colunas)
        evento.quadro = { de: nomeAntes, para: destino.quadro.nome }
      }
    }
    if (vis === 'publico' || vis === 'privado') {
      if (vis !== ticket.visibilidade) { patch.visibilidade = vis; evento.visibilidade = { de: ticket.visibilidade, para: vis } }
    }
    if (Object.keys(patch).length === 0) return null
    const { error } = await supabaseAdmin.from('tickets').update(patch).eq('id', id)
    if (error) return error.message
    const q = evento.quadro as { de: unknown; para: unknown } | undefined
    if (q) await registrarEvento(id, auth.userId, 'edicao', { campo: 'quadro', de: q.de, para: q.para })
    const v = evento.visibilidade as { de: unknown; para: unknown } | undefined
    if (v) await registrarEvento(id, auth.userId, 'edicao', { campo: 'visibilidade', de: v.de, para: v.para })
    return null
  }
  const quadroDoCorpo = (): string | null | undefined =>
    !('quadro_id' in body) ? undefined : body.quadro_id ? String(body.quadro_id) : null

  // ------------------------------------------------------------- comentar
  if (acao === 'comentar') {
    if (encerrado) return erro('Ticket encerrado — não aceita novos comentários.')
    const texto = String(body.texto || '').trim()
    if (!texto) return erro('Escreva o comentário')
    // Em ticket público, comentar te torna participante (entrar é fácil).
    if (!ehEnvolvido(ticket, participantes, auth)) {
      await garantirParticipante(id, auth.userId, auth.userId)
      await registrarEvento(id, auth.userId, 'participante_adicionado', { user_id: auth.userId, auto: true })
    }
    const err = await registrarEvento(id, auth.userId, 'comentario', { texto })
    if (err) return erro(err, 500)
    const autor = await nomeDe(auth.userId)
    await notificarTicket(ticket, todos, auth.userId,
      `${autor} comentou no ticket #${ticket.numero}`,
      texto.length > 120 ? texto.slice(0, 117) + '...' : texto, 'ticket_resposta')
    return NextResponse.json({ ok: true })
  }

  // -------------------------------------------------------------- anexar
  // Imagem/print na timeline (o upload é do cliente pro bucket `anexos`;
  // aqui só registramos o evento — mesmas regras do comentar).
  if (acao === 'anexar') {
    if (encerrado) return erro('Ticket encerrado — não aceita novos anexos.')
    const url = String(body.url || '').trim()
    const nome = String(body.nome || 'arquivo').trim().slice(0, 120) || 'arquivo'
    if (!/^https?:\/\//.test(url)) return erro('Anexo inválido.')
    if (!ehEnvolvido(ticket, participantes, auth)) {
      await garantirParticipante(id, auth.userId, auth.userId)
      await registrarEvento(id, auth.userId, 'participante_adicionado', { user_id: auth.userId, auto: true })
    }
    const err = await registrarEvento(id, auth.userId, 'anexo', { url, nome })
    if (err) return erro(err, 500)
    const autor = await nomeDe(auth.userId)
    await notificarTicket(ticket, todos, auth.userId,
      `${autor} anexou uma imagem no ticket #${ticket.numero}`, nome, 'ticket_resposta')
    return NextResponse.json({ ok: true })
  }

  // ----------------------------------------------------------- transferir
  if (acao === 'transferir') {
    if (ticket.tipo === 'compras') return erro('Solicitação de Compras segue o trilho de aprovação — use as ações da SC.')
    if (encerrado) return erro('Ticket encerrado — não pode ser transferido.')
    if (!souResponsavel && !souSolicitante && !auth.isAdmin) {
      return erro('Só o responsável atual ou o solicitante podem transferir.', 403)
    }
    const para = String(body.para || '').trim()
    if (!para) return erro('Escolha o novo responsável')
    if (para === ticket.responsavel_id) return erro('Este usuário já é o responsável.')
    const { data: novo } = await supabaseAdmin
      .from('financeiro_usu').select('id, nome, ativo').eq('id', para).maybeSingle()
    if (!novo || novo.ativo === false) return erro('Novo responsável inválido ou inativo')

    const anterior = ticket.responsavel_id
    // Novo responsável confirma (Central de Trabalho); sem a coluna, segue sem.
    let { error } = await supabaseAdmin.from('tickets').update({ responsavel_id: para, aceite: para === auth.userId ? 'ok' : 'pendente', aceite_motivo: null }).eq('id', id)
    if (error?.code === '42703') ({ error } = await supabaseAdmin.from('tickets').update({ responsavel_id: para }).eq('id', id))
    if (error) return erro(error.message, 500)

    // O ticket sai da fila pessoal do responsável anterior.
    await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', id).eq('user_id', anterior)

    // ADR-002/003: o anterior permanece participante; o novo entra.
    await garantirParticipante(id, anterior, auth.userId)
    await garantirParticipante(id, para, auth.userId)
    await registrarEvento(id, auth.userId, 'transferencia', { de: anterior, para })
    await notificarTicket({ ...ticket, responsavel_id: para }, [...todos, para], auth.userId,
      `Ticket #${ticket.numero} transferido para ${novo.nome}`,
      ticket.titulo)
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------------- aceite
  // { acao:'aceite', decisao:'confirmar'|'nova_data'|'recusar', data?, motivo? }
  // Quem recebeu o ticket (responsável) confirma, propõe outra data ou recusa.
  // Quem pediu é avisado. sql/central-trabalho.sql (tickets.aceite).
  if (acao === 'aceite') {
    if (!souResponsavel) return erro('Só quem recebeu o ticket confirma.', 403)
    const decisao = String(body.decisao || '')
    const agora = new Date().toISOString()
    const autor = await nomeDe(auth.userId)
    if (decisao === 'confirmar' || decisao === 'nova_data') {
      const patch: Record<string, unknown> = { aceite: 'ok', aceite_em: agora, aceite_motivo: null }
      let novaData: string | null = null
      if (decisao === 'nova_data') {
        novaData = /^\d{4}-\d{2}-\d{2}$/.test(String(body.data || '')) ? String(body.data) : null
        if (!novaData) return erro('Escolha a nova data')
        patch.prazo = novaData
      }
      // Quem recebeu já escolhe o bloco e se fica privado (antes de gravar o
      // aceite: bloco inválido não pode deixar o ticket confirmado pela metade).
      // Todo ticket precisa estar num bloco: sem bloco não confirma.
      if (!ticket.quadro_id && !quadroDoCorpo()) return erro('Escolha em qual bloco este ticket vai ficar.')
      const errOrg = await organizar(quadroDoCorpo(), body.visibilidade)
      if (errOrg) return erro(errOrg)
      const { error } = await supabaseAdmin.from('tickets').update(patch).eq('id', id)
      if (error) return erro(error.code === '42703' ? 'A confirmação ainda não foi ativada no banco (rode sql/central-trabalho.sql).' : error.message, error.code === '42703' ? 503 : 500)
      if (novaData) await moverEtapaDoTicket(id, novaData)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'aceite', para: 'ok', ...(novaData ? { data: novaData } : {}) })
      await notificarTicket(ticket, [ticket.solicitante_id], auth.userId,
        `${autor} confirmou o ticket #${ticket.numero}`, novaData ? `Com nova data: ${novaData.split('-').reverse().join('/')}` : ticket.titulo)
      return NextResponse.json({ ok: true })
    }
    if (decisao === 'recusar') {
      const motivo = String(body.motivo || '').trim()
      if (!motivo) return erro('Diga por que não consegue — vai para quem pediu.')
      const { error } = await supabaseAdmin.from('tickets').update({ aceite: 'recusado', aceite_em: agora, aceite_motivo: motivo.slice(0, 500) }).eq('id', id)
      if (error) return erro(error.code === '42703' ? 'A confirmação ainda não foi ativada no banco (rode sql/central-trabalho.sql).' : error.message, error.code === '42703' ? 503 : 500)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'aceite', para: 'recusado', motivo })
      await notificarTicket(ticket, [ticket.solicitante_id], auth.userId,
        `${autor} recusou o ticket #${ticket.numero}`, motivo)
      return NextResponse.json({ ok: true })
    }
    return erro('Decisão inválida')
  }

  // --------------------------------------------------------------- status
  if (acao === 'status') {
    if (ticket.tipo === 'compras') return erro('Solicitação de Compras segue o trilho de aprovação — use as ações da SC.')
    const para = String(body.para || '') as TicketStatus
    if (!STATUS_INFO[para]) return erro('Status inválido')
    // Todo ticket precisa estar num bloco antes de andar (cancelar pode sempre).
    if (!ticket.quadro_id && para !== 'cancelado') return erro('Ponha este ticket num bloco antes de trabalhar nele.')
    const invalida = validarTransicao(ticket, para, auth)
    if (invalida) return erro(invalida, 403)
    const motivo = String(body.motivo || '').trim()

    const { error } = await supabaseAdmin.from('tickets').update(camposDoStatus(para)).eq('id', id)
    if (error) return erro(error.message, 500)
    // Encerrou: sai da fila pessoal de todo mundo.
    if (STATUS_FINAIS.includes(para)) {
      await supabaseAdmin.from('tickets_plano').delete().eq('ticket_id', id)
    }
    await registrarEvento(id, auth.userId, 'status', { de: ticket.status, para, ...(motivo ? { motivo } : {}) })

    const autor = await nomeDe(auth.userId)
    const rotulo = STATUS_INFO[para].label
    await notificarTicket(ticket, todos, auth.userId,
      `Ticket #${ticket.numero}: ${rotulo}`,
      `${autor} mudou o status para "${rotulo}"${motivo ? ` — ${motivo}` : ''}`,
      para === 'resolvido' || para === 'fechado' ? 'ticket_concluido' : undefined)
    // Etapa do cronograma ligada acompanha (andamento / concluída / volta).
    await sincronizarEtapaDoTicket({ id, status: para })
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------- pedir atualização
  if (acao === 'pedir_atualizacao') {
    if (encerrado) return erro('Ticket encerrado.')
    if (souResponsavel) return erro('Você já é o responsável — a bola está com você.')
    if (!ehEnvolvido(ticket, participantes, auth) && !auth.isAdmin) {
      return erro('Só envolvidos podem pedir atualização.', 403)
    }
    const texto = String(body.texto || '').trim()
    const err = await registrarEvento(id, auth.userId, 'pedido_atualizacao', texto ? { texto } : {})
    if (err) return erro(err, 500)
    const autor = await nomeDe(auth.userId)
    await notificarTicket(ticket, [ticket.responsavel_id], auth.userId,
      `${autor} pediu atualização no ticket #${ticket.numero}`,
      texto || ticket.titulo)
    return NextResponse.json({ ok: true })
  }

  // ------------------------------------------------------ participantes
  if (acao === 'participante_add') {
    if (encerrado) return erro('Ticket encerrado.')
    if (!ehEnvolvido(ticket, participantes, auth) && !auth.isAdmin) return erro('Sem permissão', 403)
    const userId = String(body.user_id || '').trim()
    if (!userId) return erro('Escolha o usuário')
    if (envolvidos(ticket, participantes).includes(userId)) return erro('Este usuário já participa do ticket.')
    const { data: u } = await supabaseAdmin
      .from('financeiro_usu').select('id, nome, ativo').eq('id', userId).maybeSingle()
    if (!u || u.ativo === false) return erro('Usuário inválido ou inativo')

    await garantirParticipante(id, userId, auth.userId)
    await registrarEvento(id, auth.userId, 'participante_adicionado', { user_id: userId })
    await notificarTicket(ticket, [userId], auth.userId,
      `Você foi adicionado ao ticket #${ticket.numero}`, ticket.titulo)
    return NextResponse.json({ ok: true })
  }

  if (acao === 'participante_remover') {
    const userId = String(body.user_id || '').trim()
    if (!userId) return erro('Usuário não informado')
    // Saída explícita: o próprio, o solicitante ou um admin (ADR-002).
    if (userId !== auth.userId && !souSolicitante && !auth.isAdmin) return erro('Sem permissão', 403)
    if (userId === ticket.solicitante_id) return erro('O solicitante não sai do próprio ticket.')
    if (userId === ticket.responsavel_id) return erro('O responsável atual não pode ser removido — transfira primeiro.')
    if (!ehParticipanteAtivo(participantes, userId)) return erro('Este usuário não é participante ativo.')

    await supabaseAdmin
      .from('tickets_participantes')
      .update({ removido_em: new Date().toISOString() })
      .eq('ticket_id', id).eq('user_id', userId)
    await registrarEvento(id, auth.userId, 'participante_removido', { user_id: userId })
    return NextResponse.json({ ok: true })
  }

  // ------------------------------------------------------------- organizar
  // { acao:'organizar', quadro_id?: uuid|null, visibilidade?: 'privado'|'publico' }
  // Quem recebeu põe o ticket num bloco seu e decide se fica privado.
  if (acao === 'organizar') {
    if (!souResponsavel && !souSolicitante && !auth.isAdmin) return erro('Só quem recebeu ou quem pediu organiza o ticket.', 403)
    const errOrg = await organizar(quadroDoCorpo(), body.visibilidade)
    if (errOrg) return erro(errOrg)
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------- visibilidade
  if (acao === 'visibilidade') {
    if (!souSolicitante && !souResponsavel && !auth.isAdmin) return erro('Só quem pediu ou quem recebeu altera a visibilidade.', 403)
    const para = body.para === 'publico' ? 'publico' : 'privado'
    if (para === ticket.visibilidade) return erro('O ticket já está assim.')
    const { error } = await supabaseAdmin.from('tickets').update({ visibilidade: para }).eq('id', id)
    if (error) return erro(error.message, 500)
    await registrarEvento(id, auth.userId, 'edicao', { campo: 'visibilidade', de: ticket.visibilidade, para })
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------------- editar
  // Título, categoria, prazo e terceiro podem ser ajustados pelo responsável
  // ou solicitante. A DESCRIÇÃO de origem é imutável (pergunta 7 do conceito).
  if (acao === 'editar') {
    if (encerrado) return erro('Ticket encerrado.')
    if (!souResponsavel && !souSolicitante && !auth.isAdmin) return erro('Sem permissão', 403)
    const patch: Record<string, unknown> = {}
    const mudancas: Record<string, { de: unknown; para: unknown }> = {}
    for (const campo of ['titulo', 'categoria', 'terceiro_envolvido'] as const) {
      if (typeof body[campo] === 'string' && String(body[campo]).trim() !== ticket[campo]) {
        const valor = String(body[campo]).trim()
        if (campo === 'titulo' && !valor) return erro('O título não pode ficar vazio')
        patch[campo] = valor
        mudancas[campo] = { de: ticket[campo], para: valor }
      }
    }
    if ('prazo' in body) {
      const novoPrazo = body.prazo ? String(body.prazo) : null
      if (novoPrazo !== ticket.prazo) {
        patch.prazo = novoPrazo
        mudancas.prazo = { de: ticket.prazo, para: novoPrazo }
      }
    }
    // Planejamento (moram no payload): 1º dia do trabalho (Cronograma: do
    // início ao prazo), dias de trabalho e horas por dia (Fila).
    const payloadAtual = (ticket.payload || {}) as Record<string, unknown>
    const novoPayload: Record<string, unknown> = { ...payloadAtual }
    if ('inicio' in body) {
      const novo = /^\d{4}-\d{2}-\d{2}$/.test(String(body.inicio || '')) ? String(body.inicio) : null
      if (novo !== (payloadAtual.inicio ?? null)) { novoPayload.inicio = novo; mudancas.inicio = { de: payloadAtual.inicio ?? null, para: novo } }
    }
    if ('dias' in body) {
      const n = Math.round(Number(body.dias))
      if (!(n >= 1 && n <= 120)) return erro('Dias de trabalho: de 1 a 120')
      if (n !== payloadAtual.dias) { novoPayload.dias = n; mudancas.dias = { de: payloadAtual.dias ?? null, para: n } }
    }
    if ('horas_dia' in body) {
      const h = Math.round(Number(body.horas_dia) * 2) / 2
      if (!(h >= 0.5 && h <= 12)) return erro('Horas por dia: de 0,5 a 12')
      if (h !== payloadAtual.horas_dia) { novoPayload.horas_dia = h; mudancas.horas_dia = { de: payloadAtual.horas_dia ?? null, para: h } }
    }
    if (['inicio', 'dias', 'horas_dia'].some((k) => k in mudancas)) patch.payload = novoPayload
    if (Object.keys(patch).length === 0) return erro('Nada para alterar')
    const { error } = await supabaseAdmin.from('tickets').update(patch).eq('id', id)
    if (error) return erro(error.message, 500)
    await registrarEvento(id, auth.userId, 'edicao', { mudancas })
    return NextResponse.json({ ok: true })
  }

  // ------------------------------------------------------------- vincular
  // { acao:'vincular', vinculo_tipo?:'requisicao', vinculo_ref:'6423' }
  // Liga uma requisição ao ticket (o mapa de cotações vem junto — é 1:1).
  // Qualquer envolvido (ou admin) pode; ticket encerrado não aceita.
  if (acao === 'vincular') {
    if (encerrado) return erro('Ticket encerrado — não aceita novos vínculos.')
    if (!ehEnvolvido(ticket, participantes, auth) && !auth.isAdmin) return erro('Sem permissão', 403)
    const tipo = String(body.vinculo_tipo || 'requisicao')
    if (tipo !== 'requisicao') return erro('Tipo de vínculo inválido')
    const ref = String(body.vinculo_ref || '').trim().replace(/^#/, '')
    if (!/^\d+$/.test(ref)) return erro('Informe o número da requisição')
    const r = await buscarRequisicaoResumo(Number(ref))
    if (!r) return erro('Requisição não encontrada', 404)
    if (r.status === 'lixeira') return erro('Esta requisição está na lixeira.')
    const label = labelRequisicao(r)
    // INSERT antes do evento: se o UNIQUE barrar, não fica evento órfão.
    const { error } = await supabaseAdmin.from('tickets_vinculos').insert({
      ticket_id: id, vinculo_tipo: tipo, vinculo_ref: ref, vinculo_label: label, criado_por: auth.userId,
    })
    if (error) {
      if (error.code === '23505') return erro('Esta requisição já está vinculada a este ticket.')
      return erro(error.message, 500)
    }
    const err = await registrarEvento(id, auth.userId, 'vinculo_adicionado', { vinculo_tipo: tipo, vinculo_ref: ref, label })
    if (err) return erro(err, 500)
    const autor = await nomeDe(auth.userId)
    await notificarTicket(ticket, todos, auth.userId,
      `${autor} vinculou a requisição #${ref} ao ticket #${ticket.numero}`, label)
    return NextResponse.json({ ok: true })
  }

  // ---------------------------------------------------------- desvincular
  // { acao:'desvincular', vinculo_id:'uuid' } — DELETE físico + evento com o
  // snapshot (o rastro fica na timeline). Sem notificação, como participante_remover.
  if (acao === 'desvincular') {
    if (encerrado) return erro('Ticket encerrado.')
    if (!ehEnvolvido(ticket, participantes, auth) && !auth.isAdmin) return erro('Sem permissão', 403)
    const vinculoId = String(body.vinculo_id || '').trim()
    if (!vinculoId) return erro('Vínculo não informado')
    const { data: v } = await supabaseAdmin
      .from('tickets_vinculos').select('*').eq('id', vinculoId).eq('ticket_id', id).maybeSingle()
    if (!v) return erro('Vínculo não encontrado', 404)
    const { error } = await supabaseAdmin.from('tickets_vinculos').delete().eq('id', v.id)
    if (error) return erro(error.message, 500)
    await registrarEvento(id, auth.userId, 'vinculo_removido', {
      vinculo_tipo: v.vinculo_tipo, vinculo_ref: v.vinculo_ref, label: v.vinculo_label,
    })
    return NextResponse.json({ ok: true })
  }

  // ---------------------------------------------------------------- quadro
  // { acao:'quadro', quadro_id: uuid | null } — coloca o ticket num quadro (na
  // 1ª coluna) ou tira dele. Solicitante, responsável ou admin; para entrar,
  // precisa poder trabalhar no quadro de destino (sql/tickets-quadros.sql).
  if (acao === 'quadro') {
    if (!souSolicitante && !souResponsavel && !auth.isAdmin) return erro('Só o solicitante ou o responsável muda o quadro.', 403)
    const destinoId = body.quadro_id ? String(body.quadro_id) : null
    if (destinoId === (ticket.quadro_id || null)) return erro('O ticket já está neste quadro.')
    const nomeAntes = ticket.quadro_id ? (await carregarQuadro(ticket.quadro_id))?.quadro.nome ?? null : null
    // Todo ticket fica num bloco: dá para trocar, não para tirar.
    if (!destinoId) return erro('Todo ticket precisa ficar num bloco — escolha outro bloco.')
    const destino = await carregarQuadro(destinoId)
    if (!destino || destino.quadro.arquivado) return erro('Quadro não encontrado', 404)
    if (!papeis(destino, auth).trabalhar) return erro('Você não é integrante deste quadro.', 403)
    const coluna = colunaDoTicket(null, destino.colunas)
    const { error } = await supabaseAdmin.from('tickets').update({ quadro_id: destinoId, quadro_coluna_id: coluna }).eq('id', id)
    if (error) return erro(error.message, 500)
    await registrarEvento(id, auth.userId, 'edicao', { campo: 'quadro', de: nomeAntes, para: destino.quadro.nome })
    return NextResponse.json({ ok: true })
  }

  // ---------------------------------------------------------------- coluna
  // { acao:'coluna', coluna_id } — move o cartão dentro do quadro. Integrante
  // do quadro ou envolvido no ticket. Não mexe no status (ciclo de vida).
  if (acao === 'coluna') {
    if (!ticket.quadro_id) return erro('Este ticket não está em um quadro.')
    const c = await carregarQuadro(ticket.quadro_id)
    if (!c) return erro('Quadro não encontrado', 404)
    if (!papeis(c, auth).trabalhar && !ehEnvolvido(ticket, participantes, auth)) return erro('Você não pode mover cartões neste quadro.', 403)
    const colunaId = String(body.coluna_id || '')
    const destino = c.colunas.find((x) => x.id === colunaId)
    if (!destino) return erro('Coluna inválida')
    const atual = colunaDoTicket(ticket.quadro_coluna_id, c.colunas)
    // Ordem dos cartões na coluna de destino (arrastar para cima/baixo).
    const ordem = Array.isArray(body.ordem) ? (body.ordem as unknown[]).map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500) : []
    if (ordem.length) {
      await Promise.all(ordem.map((tid, i) =>
        supabaseAdmin.from('tickets').update({ quadro_posicao: i }).eq('id', tid).eq('quadro_id', ticket.quadro_id!)))
        .catch(() => { /* migration pendente: sem ordem */ })
    }
    if (atual === colunaId) return NextResponse.json({ ok: true })
    const { error } = await supabaseAdmin.from('tickets').update({ quadro_coluna_id: colunaId }).eq('id', id)
    if (error) return erro(error.message, 500)
    const de = c.colunas.find((x) => x.id === atual)?.nome ?? null
    await registrarEvento(id, auth.userId, 'edicao', { campo: 'coluna', de, para: destino.nome })
    return NextResponse.json({ ok: true })
  }

  return erro('Ação desconhecida')
}
