// REUNIÕES — condução, ações e ata.
// POST /api/reunioes/:id/acoes { acao, ... }
//   etapa            { para: ReuniaoEtapa, motivo? }                      condutor | secretário | admin
//   presenca         { usuario_id, presente: boolean }                   quem conduz, ou a própria pessoa
//   item_resultado   { item_id, resultado, decisao_texto?, decisao_motivo?, notas? }   quem conduz, em andamento
//   criar_acao       { titulo, descricao?, responsavel_id, prazo, item_id?, categoria? }  quem conduz (R8)
//   tratar_pendencia { ticket_id, saida: novo_prazo|reatribuir|escalar|cancelar, prazo?, para?, motivo? } (R3/R4)
//   publicar_ata     {}                                                   quem conduz, em ata_rascunho (R7/R10)
//   adendo           { texto }                                            quem conduz, depois da ata (R10)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets, registrarEvento, carregarTicket, notificarTicket } from '@/lib/tickets/server'
import type { Ticket } from '@/lib/tickets/constantes'
import { hojeSP } from '@/lib/trabalho/cronograma-server'
import { erroFimDeSemana, dataMinima } from '@/lib/trabalho/agenda'
import {
  podeMoverEtapa, podeConduzir, validarResultado, validarPublicacao, validarSaida, ETAPA_INFO,
  type ReuniaoEtapa, type SaidaPendencia,
} from '@/lib/reunioes/regras'
import {
  carregarReuniao, podeVerReuniao, mudarEtapa, criarAcao, reatribuirAcao, novoPrazoAcao, cancelarAcao, escalarAcao, publicarAta,
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
      if (!conduz) return erro('Só condutor, secretário ou admin movem a reunião.', 403)
      const para = String(body.para || '') as ReuniaoEtapa
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

    // ---------------------------------------------------------- presença
    if (acao === 'presenca') {
      if (publicada) return erro('Ata publicada — presença não muda mais.', 409)
      if (!uuidValido(body.usuario_id)) return erro('usuario_id inválido')
      if (!conduz && body.usuario_id !== auth.userId) return erro('Só quem conduz marca presença dos outros.', 403)
      const presente = body.presente === null ? null : !!body.presente
      const { error } = await supabaseAdmin.from('reunioes_presencas')
        .upsert({ reuniao_id: id, usuario_id: body.usuario_id, presente, marcado_em: new Date().toISOString(), papel: r.presencas.find((p) => p.usuario_id === body.usuario_id)?.papel || 'participante' }, { onConflict: 'reuniao_id,usuario_id' })
      if (error) return erro(error.message, 500)
      await registrarEvento(id, auth.userId, 'edicao', { campo: 'presenca', usuario_id: body.usuario_id, presente })
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
      if (!conduz) return erro('Só quem conduz cria ações da reunião.', 403)
      if (publicada || etapa === 'cancelada') return erro('Reunião encerrada — abra um ticket comum.', 409)
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
