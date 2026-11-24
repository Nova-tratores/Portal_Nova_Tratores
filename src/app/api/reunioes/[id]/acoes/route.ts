// REUNIÕES — condução, ações e ata.
// POST /api/reunioes/:id/acoes { acao, ... }
//   etapa            { para: ReuniaoEtapa, motivo? }                      condutor | secretário | admin
//   presenca         { usuario_id, presente: boolean }                   quem conduz, ou a própria pessoa
//   adicionar_participante { usuario_id }                                quem conduz, até a ata ser publicada (última hora)
//   item_resultado   { item_id, resultado, decisao_texto?, decisao_motivo?, notas? }   quem conduz, em andamento
//   criar_acao       { titulo, descricao?, responsavel_id, prazo, item_id?, categoria? }  quem conduz ou participa, menos cancelada
//   titulo           { titulo }                                          quem criou ou conduz, até publicar
//   anotacoes        { texto }                                           quem conduz ou participa, até publicar (ata durante a reunião)
//   virar_serie      { recorrencia }                                     quem conduz ou quem marcou; reunião avulsa vira série
//   continuar        { dia, hora, titulo, participantes[] }              reunião seguinte (ramificação), uma vez
//   remarcar         { dia, hora, duracao_min? }                         quem conduz, quem criou ou admin; antes de começar
//   tratar_pendencia { ticket_id, saida: novo_prazo|reatribuir|escalar|cancelar, prazo?, para?, motivo? } (R3/R4)
//   publicar_ata     {}                                                   quem conduz, em ata_rascunho (R7/R10)
//   adendo           { texto }                                            quem conduz, depois da ata (R10)
//   reabrir          { motivo? }                                          quem criou, condutor ou admin: ata → condução, cancelada → agendada
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets, registrarEvento, carregarTicket, notificarTicket, garantirParticipante } from '@/lib/tickets/server'
import { indisponiveis } from '@/lib/agenda/bloqueios-server'
import { mensagemIndisponiveis } from '@/lib/agenda/bloqueios'
import { isoDe, fimDaReuniao, localDe } from '@/lib/salas/regras'
import type { Ticket } from '@/lib/tickets/constantes'
import { hojeSP } from '@/lib/trabalho/cronograma-server'
import { enviarConvitesEmail, enviarConvitesWhats, normalizarCelular } from '@/lib/reunioes/convite'
import { erroFimDeSemana, dataMinima } from '@/lib/trabalho/agenda'
import {
  podeMoverEtapa, podeConduzir, podeReabrir, REABRIR_PARA, validarResultado, validarPublicacao, validarSaida, ETAPA_INFO,
  type ReuniaoEtapa, type SaidaPendencia,
} from '@/lib/reunioes/regras'
import {
  carregarReuniao, podeVerReuniao, mudarEtapa, criarAcao, reatribuirAcao, novoPrazoAcao, cancelarAcao, escalarAcao, publicarAta, criadorDaReuniao, reabrirReuniao, remarcarReuniao, virarSerie, continuarReuniao,
  uuidValido, migrationFaltou, MSG_MIGRATION_REUNIOES,
} from '@/lib/reunioes/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao || '')
  try {
    const r = await carregarReuniao(id)
    if (!r || !(await podeVerReuniao(r, auth))) return erro('Reunião não encontrada', 404)
    const etapa = r.ticket.reuniao_etapa as ReuniaoEtapa
    const conduz = podeConduzir(r.presencas, auth.userId, auth.isAdmin)
    const publicada = etapa === 'ata_publicada'

    // ------------------------------------------------------------- etapa
    if (acao === 'etapa') {
      const para = String(body.para || '') as ReuniaoEtapa
      // quem marcou também cancela / marca "Não aconteceu" (23/11/2026); o resto continua só de quem conduz
      if (!conduz && !(para === 'cancelada' && (await criadorDaReuniao(id)) === auth.userId)) return erro('Só condutor, secretário ou admin movem a reunião.', 403)
      if (!ETAPA_INFO[para]) return erro('Etapa inválida')
      if (!podeMoverEtapa(etapa, para)) return erro(`Não dá para ir de "${ETAPA_INFO[etapa].label}" para "${ETAPA_INFO[para].label}".`, 409)
      if (para === 'ata_publicada') return erro('Use a ação publicar_ata.', 409)
      await mudarEtapa(auth, r, para, body.motivo ? String(body.motivo).slice(0, 500) : undefined)
      if (para === 'em_andamento' || para === 'cancelada') {
        await notificarTicket(r.ticket, r.presencas.map((p) => p.usuario_id), auth.userId,
          para === 'em_andamento' ? `Reunião começou: ${r.ticket.titulo}` : `Reunião cancelada: ${r.ticket.titulo}`, body.motivo ? String(body.motivo) : undefined)
      }
      return NextResponse.json({ ok: true })
    }

    // ----------------------------------------------------------- titulo
    // { titulo } — quem criou ou quem conduz renomeia, mesmo com a reunião aberta (José, 17/11/2026)
    if (acao === 'titulo') {
      const criador = await criadorDaReuniao(id)
      if (!conduz && criador !== auth.userId) return erro('Só quem criou ou quem conduz muda o título.', 403)
      if (publicada) return erro('A ata já foi publicada — use um adendo.', 409)
      const titulo = String(body.titulo || '').trim().slice(0, 200)
      if (!titulo) return erro('Escreva o título.')
      // descrição opcional junto (José, 23/11/2026: editar título e descrição pelo botão Editar)
      const descricao = body.descricao === undefined ? undefined : String(body.descricao || '').trim().slice(0, 4000)
      // pública/privada (José, 23/11/2026). Privada continua visível para quem está na reunião (tickets_participantes).
      const visibilidade = body.visibilidade === 'privado' || body.visibilidade === 'publico' ? body.visibilidade : undefined
      const { error } = await supabaseAdmin.from('tickets').update({ titulo, ...(descricao !== undefined ? { descricao } : {}), ...(visibilidade ? { visibilidade } : {}) }).eq('id', id)
      if (error) return erro(error.message, 500)
      const mudancas: Record<string, { de: unknown; para: unknown }> = {}
      if (visibilidade && visibilidade !== r.ticket.visibilidade) mudancas.visibilidade = { de: r.ticket.visibilidade, para: visibilidade }
      if (titulo !== r.ticket.titulo) mudancas.titulo = { de: r.ticket.titulo, para: titulo }
      if (descricao !== undefined && descricao !== (r.ticket.descricao || '')) mudancas.descricao = { de: r.ticket.descricao, para: descricao }
      if (Object.keys(mudancas).length) await registrarEvento(id, auth.userId, 'edicao', { mudancas })
      return NextResponse.json({ ok: true })
    }

    // -------------------------------------------------------- anotacoes
    // { texto } — a ata escrita DURANTE a reunião (José, 17/11/2026: "espaço para a ata durante, não depois").
    // Fica em tickets.payload.ata_texto; quem conduz ou participa escreve até a ata ser publicada (depois: adendo).
    if (acao === 'anotacoes') {
      const participa = r.presencas.some((p) => p.usuario_id === auth.userId)
      if (!conduz && !participa) return erro('Só quem participa da reunião escreve a ata.', 403)
      if (publicada) return erro('A ata já foi publicada — use um adendo.', 409)
      if (etapa === 'cancelada') return erro('Reunião cancelada.', 409)
      const texto = String(body.texto ?? '').slice(0, 20000)
      // Relê o payload NA HORA (23/11/2026): antes usava o lido no começo e podia apagar a gravação registrada
      // no meio do caminho. E se OUTRA pessoa salvou depois da versão que esta tela tinha (base_em), não
      // sobrescreve: devolve 409 com o texto atual para a tela perguntar (a menos que venha forcar: true).
      const { data: fresco } = await supabaseAdmin.from('tickets').select('payload').eq('id', id).single()
      const atual = ((fresco?.payload as Record<string, unknown>) || {})
      const baseEm = body.base_em ? String(body.base_em) : null
      if (!body.forcar && atual.ata_texto_em && atual.ata_texto_em !== baseEm && atual.ata_texto_por !== auth.userId && atual.ata_texto !== texto) {
        const { data: quem } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', String(atual.ata_texto_por || '')).maybeSingle()
        return NextResponse.json({ error: `${quem?.nome || 'Outra pessoa'} mudou a ata enquanto você escrevia.`, conflito: true, texto: atual.ata_texto ?? '', em: atual.ata_texto_em }, { status: 409 })
      }
      const payload = { ...atual, ata_texto: texto, ata_texto_em: new Date().toISOString(), ata_texto_por: auth.userId }
      const { error } = await supabaseAdmin.from('tickets').update({ payload }).eq('id', id)
      if (error) return erro(error.message, 500)
      return NextResponse.json({ ok: true, em: payload.ata_texto_em })
    }

    // -------------------------------------------------------- virar_serie
    // { recorrencia: semanal|quinzenal|mensal } — a reunião avulsa vira a 1ª de uma série; a próxima já é marcada.
    if (acao === 'virar_serie') {
      const criador = await criadorDaReuniao(id)
      if (!conduz && criador !== auth.userId) return erro('Só quem conduz ou quem marcou a reunião faz dela uma série.', 403)
      if (r.serie) return erro('Esta reunião já faz parte de uma série.', 409)
      if (etapa === 'cancelada') return erro('Reunião cancelada.', 409)
      const rec = String(body.recorrencia || '')
      if (rec !== 'semanal' && rec !== 'quinzenal' && rec !== 'mensal') return erro('Escolha: toda semana, a cada 15 dias ou todo mês.')
      const parts = Array.isArray(body.participantes) ? (body.participantes as unknown[]).filter((u): u is string => uuidValido(u)) : undefined
      const res = await virarSerie(auth, r, rec, { nome: body.nome ? String(body.nome) : undefined, participantes: parts })
      return NextResponse.json({ ok: true, serie_id: res.serie.id, proxima: res.proxima ? { id: res.proxima.id, inicio: res.proxima.reuniao_inicio } : null })
    }

    // -------------------------------------------------------- continuar
    // { dia, hora, titulo, participantes[] } — marca UMA reunião seguinte a partir desta (outro assunto/pessoas).
    if (acao === 'continuar') {
      const criador = await criadorDaReuniao(id)
      if (!conduz && criador !== auth.userId) return erro('Só quem conduz ou quem marcou a reunião marca a continuação.', 403)
      const dia = String(body.dia || ''); const hora = String(body.hora || '').slice(0, 5)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return erro('Informe o dia.')
      if (!/^\d{2}:\d{2}$/.test(hora)) return erro('Informe a hora (HH:MM).')
      if (dia < hojeSP()) return erro('A data não pode ser no passado.')
      if (r.ticket.reuniao_inicio && new Date(isoDe(dia, hora)).getTime() === new Date(r.ticket.reuniao_inicio).getTime()) return erro('Esse é o mesmo dia e hora desta reunião. Escolha outro horário para a próxima.')
      const parts = Array.isArray(body.participantes) ? (body.participantes as unknown[]).filter((u): u is string => uuidValido(u)) : r.presencas.map((p) => p.usuario_id)
      const res = await continuarReuniao(auth, r, { dia, hora, titulo: String(body.titulo || ''), participantes: parts })
      return NextResponse.json({ ok: true, reuniao_id: res.ticket.id })
    }

    // ---------------------------------------------------------- remarcar
    // { dia: YYYY-MM-DD, hora: HH:MM, duracao_min? } — quem conduz, quem criou ou admin; só antes de começar.
    if (acao === 'remarcar') {
      const criador = await criadorDaReuniao(id)
      if (!conduz && criador !== auth.userId) return erro('Só quem conduz ou quem marcou a reunião muda a data.', 403)
      if (etapa !== 'agendada' && etapa !== 'pauta_fechada') return erro('Só dá para remarcar reunião que ainda não começou.', 409)
      const dia = String(body.dia || ''); const hora = String(body.hora || '').slice(0, 5)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return erro('Informe o novo dia.')
      if (!/^\d{2}:\d{2}$/.test(hora)) return erro('Informe a nova hora (HH:MM).')
      if (dia < hojeSP()) return erro('A nova data não pode ser no passado.')
      const atual = Number((r.ticket.payload as { duracao_min?: unknown })?.duracao_min) || r.serie?.duracao_min || 30
      const dur = body.duracao_min === undefined ? atual : Math.round(Number(body.duracao_min))
      if (!(dur >= 5 && dur <= 480)) return erro('Duração: de 5 a 480 minutos.')
      try {
        const res = await remarcarReuniao(auth, r, { dia, hora, duracao_min: dur })
        return NextResponse.json({ ok: true, aviso: res.aviso })
      } catch (e) {
        if ((e as { code?: string }).code === 'SALA_OCUPADA') return erro((e as Error).message, 409)
        throw e
      }
    }

    // ---------------------------------------------------------- presença
    if (acao === 'presenca') {
      if (publicada) return erro('Ata publicada — presença não muda mais.', 409)
      if (!uuidValido(body.usuario_id)) return erro('usuario_id inválido')
      if (!conduz && body.usuario_id !== auth.userId) return erro('Só quem conduz marca presença dos outros.', 403)
      // Sem isto, marcar a própria presença numa reunião pública virava "entrar na reunião" (e mexer na ata) — 23/11/2026.
      // Quem não foi chamado entra pelo "Chamar mais alguém…" de quem conduz.
      if (!r.presencas.some((p) => p.usuario_id === body.usuario_id)) return erro('Essa pessoa não está na reunião. Quem conduz pode chamá-la.', 403)
      const presente = body.presente === null ? null : !!body.presente
      const { error } = await supabaseAdmin.from('reunioes_presencas')
        .upsert({ reuniao_id: id, usuario_id: body.usuario_id, presente, marcado_em: new Date().toISOString(), papel: r.presencas.find((p) => p.usuario_id === body.usuario_id)?.papel || 'participante' }, { onConflict: 'reuniao_id,usuario_id' })
      if (error) return erro(error.message, 500)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'presenca', usuario_id: body.usuario_id, presente })
      return NextResponse.json({ ok: true })
    }

    // ------------------------------------------ adicionar_participante
    // Pessoa de última hora: entra nas presenças E nos participantes do ticket
    // (senão não enxerga reunião privada) e recebe o aviso.
    if (acao === 'adicionar_participante') {
      if (!conduz && (await criadorDaReuniao(id)) !== auth.userId) return erro('Só quem conduz ou quem marcou a reunião inclui pessoas.', 403)
      if (publicada || etapa === 'cancelada') return erro('Reunião encerrada — não dá mais para incluir pessoas.', 409)
      const uid = String(body.usuario_id || '')
      if (!uuidValido(uid)) return erro('usuario_id inválido')
      if (r.presencas.some((p) => p.usuario_id === uid)) return erro('Essa pessoa já está na reunião.', 409)
      if (r.ticket.reuniao_inicio) {   // agenda pessoal: horário bloqueado = não entra
        const l = localDe(r.ticket.reuniao_inicio)
        const dur = Number((r.ticket.payload as { duracao_min?: unknown })?.duracao_min) || r.serie?.duracao_min || 30
        const ocup = await indisponiveis([uid], r.ticket.reuniao_inicio, isoDe(l.dia, fimDaReuniao(l.hora, dur)))
        if (ocup.length) return erro(`${mensagemIndisponiveis(ocup)}.`, 409)
      }
      const { data: u } = await supabaseAdmin.from('financeiro_usu').select('id, nome, ativo').eq('id', uid).maybeSingle()
      if (!u || u.ativo === false) return erro('Usuário não encontrado ou inativo.', 404)
      const { error } = await supabaseAdmin.from('reunioes_presencas').insert({ reuniao_id: id, usuario_id: uid, papel: 'participante' })
      if (error) return erro(error.message, 500)
      await garantirParticipante(id, uid, auth.userId)
      await registrarEvento(id, auth.userId, 'participante_adicionado', { user_id: uid, reuniao: true, ultima_hora: true })
      const inicio = r.ticket.reuniao_inicio ? new Date(r.ticket.reuniao_inicio) : null
      const quando = inicio
        ? `${inicio.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })} às ${inicio.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`
        : ''
      await notificarTicket(r.ticket, [uid], auth.userId, `Você foi incluído na reunião: ${r.ticket.titulo}`, quando ? `${quando}.` : undefined)
      await enviarConvitesEmail(r.ticket, [uid], auth.userId)
      const falhas = await enviarConvitesWhats(r.ticket, [uid], auth.userId)   // Chatwoot (24/11/2026)
      return NextResponse.json({ ok: true, semWhats: falhas })
    }

    // ----------------------------------------------------------- responder
    // { resposta: aceito|recusado } — a própria pessoa responde o convite (sql/reunioes-convite.sql).
    if (acao === 'responder') {
      const resposta = body.resposta === 'aceito' || body.resposta === 'recusado' ? body.resposta : null
      if (!resposta) return erro('Responda: aceito ou recusado.')
      if (!r.presencas.some((p) => p.usuario_id === auth.userId)) return erro('Você não está nesta reunião.', 403)
      if (publicada || etapa === 'cancelada') return erro('Reunião encerrada.', 409)
      const { error } = await supabaseAdmin.from('reunioes_presencas').update({ resposta, respondido_em: new Date().toISOString() })
        .eq('reuniao_id', id).eq('usuario_id', auth.userId)
      if (error) return erro(/resposta/.test(error.message) ? 'Falta rodar sql/reunioes-convite.sql no Supabase.' : error.message, 500)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'convite_resposta', resposta })
      const { data: eu } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle()
      const avisar = [...new Set([r.presencas.find((p) => p.papel === 'condutor')?.usuario_id, await criadorDaReuniao(id)].filter((x): x is string => !!x))]
      await notificarTicket(r.ticket, avisar, auth.userId, `${eu?.nome || 'Alguém'} ${resposta === 'aceito' ? 'aceitou' : 'recusou'}: ${r.ticket.titulo}`)
      return NextResponse.json({ ok: true })
    }

    // ------------------------------------------------------ salvar_celular
    // { usuario_id, celular } — o botão de WhatsApp do convite pede o número quando falta e grava no cadastro.
    if (acao === 'salvar_celular') {
      const uid = String(body.usuario_id || '')
      if (!uuidValido(uid)) return erro('usuario_id inválido')
      if (uid !== auth.userId && !conduz && (await criadorDaReuniao(id)) !== auth.userId) return erro('Só quem conduz ou quem marcou a reunião cadastra o celular dos outros.', 403)
      const celular = normalizarCelular(body.celular)
      if (!celular) return erro('Celular inválido. Use DDD + número, ex.: (15) 99999-1234.')
      const { error } = await supabaseAdmin.from('financeiro_usu').update({ celular }).eq('id', uid)
      if (error) return erro(/celular/.test(error.message) ? 'Falta rodar sql/reunioes-convite.sql no Supabase.' : error.message, 500)
      return NextResponse.json({ ok: true, celular })
    }

    // -------------------------------------------------------- mandar_whats
    // { usuario_id } — manda (de novo) o convite pelo Chatwoot para uma pessoa (24/11/2026; antes abria o wa.me).
    if (acao === 'mandar_whats') {
      const uid = String(body.usuario_id || '')
      if (!uuidValido(uid)) return erro('usuario_id inválido')
      if (!conduz && (await criadorDaReuniao(id)) !== auth.userId) return erro('Só quem conduz ou quem marcou a reunião manda o convite.', 403)
      if (!r.presencas.some((p) => p.usuario_id === uid)) return erro('Essa pessoa não está na reunião.', 404)
      const falhas = await enviarConvitesWhats(r.ticket, [uid], auth.userId)
      if (falhas.length) return erro(`Não foi: ${falhas[0].motivo}.`, 502)
      return NextResponse.json({ ok: true })
    }

    // ------------------------------------------ remover_participante
    // { usuario_id } — José, 23/11/2026: "não consigo remover alguém que eu já coloquei".
    // Quem conduz ou quem criou; até a ata ser publicada. Quem conduz não sai (troque o condutor antes).
    if (acao === 'remover_participante') {
      const criador = await criadorDaReuniao(id)
      if (!conduz && criador !== auth.userId) return erro('Só quem conduz ou quem marcou a reunião tira pessoas.', 403)
      if (publicada || etapa === 'cancelada') return erro('Reunião encerrada — não dá mais para tirar pessoas.', 409)
      const uid = String(body.usuario_id || '')
      if (!uuidValido(uid)) return erro('usuario_id inválido')
      const pres = r.presencas.find((p) => p.usuario_id === uid)
      if (!pres) return erro('Essa pessoa não está na reunião.', 404)
      if (pres.papel === 'condutor') return erro('Quem conduz não pode ser tirado da reunião.', 409)
      if (pres.presente === true) return erro('Essa pessoa já foi marcada como presente. Desmarque a presença antes de tirar.', 409)
      const { error } = await supabaseAdmin.from('reunioes_presencas').delete().eq('reuniao_id', id).eq('usuario_id', uid)
      if (error) return erro(error.message, 500)
      // sai também dos participantes do ticket (reunião privada deixa de aparecer para ela)
      await supabaseAdmin.from('tickets_participantes').update({ removido_em: new Date().toISOString() }).eq('ticket_id', id).eq('user_id', uid).is('removido_em', null)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'participante_removido', user_id: uid, papel: pres.papel })
      await notificarTicket(r.ticket, [uid], auth.userId, `Você não está mais na reunião: ${r.ticket.titulo}`)
      return NextResponse.json({ ok: true })
    }

    // ----------------------------------------------------- item_resultado
    if (acao === 'item_resultado') {
      if (!conduz) return erro('Só quem conduz registra o resultado.', 403)
      if (etapa !== 'em_andamento' && etapa !== 'ata_rascunho') return erro('Resultado só durante a reunião (ou ao fechar o rascunho da ata).', 409)
      if (!uuidValido(body.item_id)) return erro('item_id inválido')
      const item = r.itens.find((i) => i.id === body.item_id)
      if (!item) return erro('Item não encontrado', 404)
      const v = validarResultado(item.tipo, body)
      if (!v.ok) return erro(v.erro)
      const notas = body.notas !== undefined ? String(body.notas || '').trim().slice(0, 4000) || null : item.notas
      const { error } = await supabaseAdmin.from('reunioes_itens').update({ ...v.campos, notas, atualizado_em: new Date().toISOString() }).eq('id', item.id)
      if (error) return erro(error.message, 500)
      await registrarEvento(id, auth.userId, 'item_resultado', { item_id: item.id, pergunta: item.pergunta, ...v.campos })
      return NextResponse.json({ ok: true })
    }

    // --------------------------------------------------------- criar_acao
    if (acao === 'criar_acao') {
      // José, 17/11/2026 ("muito difícil"): qualquer participante cria, antes, durante ou depois da reunião.
      const participa = r.presencas.some((p) => p.usuario_id === auth.userId)
      if (!conduz && !participa) return erro('Só quem participa da reunião cria tarefas dela.', 403)
      if (etapa === 'cancelada') return erro('Reunião cancelada — abra um ticket comum.', 409)
      const titulo = String(body.titulo || '').trim()
      const responsavel = String(body.responsavel_id || '')
      const prazo = String(body.prazo || '')
      if (!titulo) return erro('Dê um título à ação.')
      if (!uuidValido(responsavel)) return erro('Escolha o responsável (obrigatório).')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return erro('Defina o prazo (obrigatório).')
      if (prazo < dataMinima(hojeSP(), true)) return erro('O prazo não pode ser no passado.')
      const fds = erroFimDeSemana({ prazo })
      if (fds) return erro(fds)
      const { data: resp } = await supabaseAdmin.from('financeiro_usu').select('id, ativo').eq('id', responsavel).maybeSingle()
      if (!resp || resp.ativo === false) return erro('Responsável inválido ou inativo')
      const itemId = body.item_id && uuidValido(body.item_id) ? body.item_id : null
      if (itemId && !r.itens.some((i) => i.id === itemId)) return erro('Item não pertence a esta reunião')
      const item = itemId ? r.itens.find((i) => i.id === itemId) : null
      const descricao = String(body.descricao || '').trim() || `Ação decidida em "${r.ticket.titulo}"${item ? ` — item: ${item.pergunta}${item.decisao_texto ? ` · Decisão: ${item.decisao_texto}` : ''}` : ''}.`
      const t = await criarAcao(auth, r, { titulo: titulo.slice(0, 200), descricao, responsavel_id: responsavel, prazo, item_id: itemId, categoria: body.categoria ? String(body.categoria).slice(0, 60) : null })
      return NextResponse.json({ ticket: t })
    }

    // --------------------------------------------------- tratar_pendencia
    if (acao === 'tratar_pendencia') {
      if (!conduz) return erro('Só quem conduz trata pendências.', 403)
      if (publicada || etapa === 'cancelada') return erro('Reunião encerrada.', 409)
      if (!uuidValido(body.ticket_id)) return erro('ticket_id inválido')
      const base = await carregarTicket(body.ticket_id)
      if (!base || !base.ticket.origem_reuniao_id) return erro('Essa ação não nasceu numa reunião.', 404)
      const alvo = base.ticket as Ticket
      const saida = String(body.saida || '') as SaidaPendencia
      const invalida = validarSaida(saida, { prazo_reprogramacoes: alvo.prazo_reprogramacoes || 0, status: alvo.status })
      if (invalida) return erro(invalida, saida === 'novo_prazo' && invalida.includes('reprogramada') ? 409 : 400)
      const motivo = String(body.motivo || '').trim().slice(0, 500)
      const payloadBase = { saida, reuniao_id: id, ticket_id: alvo.id, numero: alvo.numero, ...(motivo ? { motivo } : {}) }
      let extra: Record<string, unknown> = {}

      if (saida === 'novo_prazo') {
        const prazo = String(body.prazo || '')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return erro('Informe o novo prazo.')
        if (prazo < dataMinima(hojeSP(), true)) return erro('O novo prazo não pode ser no passado.')
        const fds = erroFimDeSemana({ prazo }); if (fds) return erro(fds)
        if (prazo === alvo.prazo) return erro('É o mesmo prazo de hoje.')
        await novoPrazoAcao(auth, alvo, prazo)
        extra = { de: alvo.prazo, para: prazo, reprogramacoes: (alvo.prazo_reprogramacoes || 0) + 1 }
      } else if (saida === 'reatribuir') {
        const para = String(body.para || '')
        if (!uuidValido(para)) return erro('Escolha o novo responsável.')
        if (para === alvo.responsavel_id) return erro('Essa pessoa já é a responsável.')
        const { data: novo } = await supabaseAdmin.from('financeiro_usu').select('id, nome, ativo').eq('id', para).maybeSingle()
        if (!novo || novo.ativo === false) return erro('Novo responsável inválido ou inativo')
        await reatribuirAcao(auth, alvo, para, novo.nome)
        extra = { de: alvo.responsavel_id, para }
      } else if (saida === 'escalar') {
        const para = body.para && uuidValido(body.para) ? body.para : null
        extra = await escalarAcao(auth, r, alvo, para)
      } else if (saida === 'cancelar') {
        await cancelarAcao(auth, alvo, motivo || `Cancelada na reunião "${r.ticket.titulo}"`)
      }
      await registrarEvento(alvo.id, auth.userId, 'pendencia_tratada', { ...payloadBase, ...extra })
      await registrarEvento(id, auth.userId, 'pendencia_tratada', { ...payloadBase, titulo: alvo.titulo, ...extra })
      return NextResponse.json({ ok: true, ...extra })
    }

    // ------------------------------------------------------- publicar_ata
    if (acao === 'publicar_ata') {
      if (!conduz) return erro('Só condutor, secretário ou admin publicam a ata.', 403)
      if (publicada || r.ata) return erro('A ata já foi publicada — use um adendo.', 409)
      if (etapa !== 'ata_rascunho' && etapa !== 'em_andamento') return erro('A ata só se publica depois da reunião (em andamento ou rascunho).', 409)
      const erros = validarPublicacao(r.itens)
      if (erros.length) return NextResponse.json({ error: 'Ainda falta resultado em item de decisão.', pendentes: erros }, { status: 409 })
      if (etapa === 'em_andamento') { await mudarEtapa(auth, r, 'ata_rascunho'); const r2 = await carregarReuniao(id); if (r2) Object.assign(r, r2) }
      const origem = req.headers.get('origin') || process.env.PORTAL_BASE || process.env.PORTAL_URL || 'https://portal.novatratores.com'
      const ata = await publicarAta(auth, r, `${origem.replace(/\/$/, '')}/reunioes/${id}`)
      return NextResponse.json({ ata })
    }

    // ------------------------------------------------------------ reabrir
    if (acao === 'reabrir') {
      const para = REABRIR_PARA[etapa]
      if (!para) return erro('Esta reunião não está fechada.', 409)
      const criador = await criadorDaReuniao(id)
      if (!podeReabrir(criador, r.ticket.solicitante_id, auth.userId, auth.isAdmin)) return erro('Só quem criou a reunião (ou o condutor/admin) reabre.', 403)
      await reabrirReuniao(auth, r, para)
      await notificarTicket(r.ticket, r.presencas.map((p) => p.usuario_id), auth.userId, `Reunião reaberta: ${r.ticket.titulo}`,
        etapa === 'ata_publicada' ? 'A ata voltou para edição e será publicada de novo.' : undefined)
      return NextResponse.json({ ok: true, etapa: para })
    }

    // ------------------------------------------------------------- adendo
    if (acao === 'adendo') {
      if (!conduz) return erro('Só condutor, secretário ou admin registram adendo.', 403)
      if (!publicada || !r.ata) return erro('Adendo só depois da ata publicada.', 409)
      const texto = String(body.texto || '').trim()
      if (!texto) return erro('Escreva o adendo.')
      if (texto.length > 4000) return erro('Adendo: no máximo 4000 caracteres.')
      await registrarEvento(id, auth.userId, 'ata_adendo', { texto })
      await notificarTicket(r.ticket, r.presencas.map((p) => p.usuario_id), auth.userId, `Adendo na ata: ${r.ticket.titulo}`, texto.slice(0, 200))
      return NextResponse.json({ ok: true })
    }

    return erro('Ação inválida')
  } catch (e) {
    if (migrationFaltou(e)) return erro(MSG_MIGRATION_REUNIOES, 503)
    const code = (e as { code?: string })?.code
    if (code === 'CONFLITO') return erro(e instanceof Error ? e.message : 'Conflito', 409)
    if (code === 'SEM_SERIE' || code === 'SEM_PROXIMA') return erro(e instanceof Error ? e.message : 'Sem próxima reunião', 409)
    console.error('[reunioes/id/acoes] POST', e)
    return erro(e instanceof Error ? e.message : 'Falha na ação', 500)
  }
}
