// SC — TODAS as mutações passam por aqui (service role).
// POST /api/decisoes/:id/acoes  { acao, ...campos }
//
// Ações (alçadas do documento §1.2):
//   alterar_qtd | parecer | emitir_pc | cancelar | comentar
//
// Regras: justificativa obrigatória em toda decisão; papel do ator compatível
// com o tipo de evento; encadeamento (parecer referencia a alteração/criação);
// ledger append-only (a correção seria um novo evento, nunca edição).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import {
  temModuloDecisoes, papeisDoUsuario, carregarSC, registrarDecisao, atualizarSC,
  notificarDecisao, envolvidosSC, usuariosComPapel, ultimaDecisao, nomeDe,
} from '@/lib/decisoes/server'
import { STATUS_FINAIS, type Papel, type SolicitacaoCompra } from '@/lib/decisoes/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function erro(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

function podePapel(auth: Autenticado, papel: Papel): boolean {
  if (auth.isAdmin) return true
  return papeisDoUsuario(auth).includes(papel)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloDecisoes(auth)) return erro('Sem permissão', 403)

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }
  const acao = String(body.acao || '')
  const justificativa = String(body.justificativa || body.texto || '').trim()

  const sc = await carregarSC(id)
  if (!sc) return erro('Solicitação não encontrada', 404)
  const encerrada = STATUS_FINAIS.includes(sc.status)

  // --------------------------------------------------------- comentar
  if (acao === 'comentar') {
    if (!justificativa) return erro('Escreva o comentário')
    const err = await registrarDecisao({
      scId: id, atorId: auth.userId, papel: 'comercial', tipo: 'comentario', justificativa,
    })
    if (err) return erro(err, 500)
    const autor = await nomeDe(auth.userId)
    await notificarDecisao(sc, await envolvidosSC(sc), auth.userId,
      `${autor} comentou na SC #${sc.numero}`,
      justificativa.length > 120 ? justificativa.slice(0, 117) + '...' : justificativa)
    return NextResponse.json({ ok: true })
  }

  // ------------------------------------------------------- alterar_qtd
  if (acao === 'alterar_qtd') {
    if (sc.status !== 'aguardando_diretoria') return erro('A SC não está aguardando a diretoria.')
    if (!podePapel(auth, 'diretoria_compras')) return erro('Só a Diretoria de Compras ajusta o lote.', 403)
    if (!justificativa) return erro('Justifique o ajuste do lote (desconto, giro, etc.)')
    const nova = Math.max(1, Math.floor(Number(body.qtd_atual) || sc.qtd_atual))
    const upErr = await atualizarSC(id, { qtd_atual: nova, status: 'aguardando_financeiro' })
    if (upErr) return erro(upErr, 500)
    await registrarDecisao({
      scId: id, atorId: auth.userId, papel: 'diretoria_compras', tipo: 'qtd_alterada', justificativa,
      estadoAnterior: { qtd: sc.qtd_atual }, estadoNovo: { qtd: nova },
      decisaoAnterior: await ultimaDecisao(id, ['sc_criada']),
    })
    const fin = await usuariosComPapel('financeiro')
    await notificarDecisao(sc, [...fin, sc.vendedor_id], auth.userId,
      `SC #${sc.numero}: lote ${sc.qtd_atual}→${nova}`,
      'Aguardando parecer do financeiro.')
    return NextResponse.json({ ok: true })
  }

  // ----------------------------------------------------------- parecer
  if (acao === 'parecer') {
    if (sc.status !== 'aguardando_financeiro') return erro('A SC não está aguardando o financeiro.')
    if (!podePapel(auth, 'financeiro')) return erro('Só o Financeiro dá parecer.', 403)
    if (!justificativa) return erro('Escreva o parecer (aprovação/ressalva e o porquê)')
    const aprovado = body.aprovado === true || body.aprovado === 'true'
    const prazo = aprovado && body.prazo_compromisso ? String(body.prazo_compromisso) : null
    const novoStatus = aprovado ? 'aprovada' : 'recusada'
    const upErr = await atualizarSC(id, { status: novoStatus })
    if (upErr) return erro(upErr, 500)
    await registrarDecisao({
      scId: id, atorId: auth.userId, papel: 'financeiro', tipo: 'parecer_financeiro', justificativa,
      estadoNovo: { aprovado }, prazoCompromisso: prazo,
      decisaoAnterior: await ultimaDecisao(id, ['qtd_alterada', 'sc_criada']),
    })
    const alvo = aprovado ? await usuariosComPapel('comprador') : []
    await notificarDecisao(sc, [...alvo, sc.vendedor_id], auth.userId,
      `SC #${sc.numero}: ${aprovado ? 'aprovada' : 'recusada'} pelo financeiro`,
      aprovado ? (prazo ? `Compromisso de liquidação até ${prazo}.` : 'Liberada para emissão do PC.') : justificativa)
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------- emitir_pc
  if (acao === 'emitir_pc') {
    if (sc.status !== 'aprovada') return erro('A SC precisa estar aprovada pelo financeiro.')
    if (!podePapel(auth, 'comprador')) return erro('Só o Comprador registra o PC.', 403)
    const pcNumero = String(body.pc_numero || '').trim()
    if (!pcNumero) return erro('Informe o nº do Pedido de Compra emitido no Omie')
    if (!justificativa) return erro('Registre as condições finais da fábrica')
    const upErr = await atualizarSC(id, { status: 'pc_emitida', pc_numero: pcNumero })
    if (upErr) return erro(upErr, 500)
    await registrarDecisao({
      scId: id, atorId: auth.userId, papel: 'comprador', tipo: 'pc_emitido', justificativa,
      estadoNovo: { pc_numero: pcNumero }, documentoRef: pcNumero,
      decisaoAnterior: await ultimaDecisao(id, ['parecer_financeiro']),
    })
    await notificarDecisao(sc, await envolvidosSC(sc), auth.userId,
      `SC #${sc.numero}: PC ${pcNumero} emitido`,
      `${sc.qtd_atual}× ${sc.modelo}.`)
    return NextResponse.json({ ok: true })
  }

  // --------------------------------------------------------- cancelar
  if (acao === 'cancelar') {
    if (encerrada) return erro('SC já encerrada.')
    // Qualquer papel com alçada (ou o vendedor da SC) pode cancelar.
    const papeis = papeisDoUsuario(auth)
    if (papeis.length === 0 && sc.vendedor_id !== auth.userId && !auth.isAdmin) return erro('Sem permissão', 403)
    if (!justificativa) return erro('Justifique o cancelamento')
    const meuPapel: Papel = auth.isAdmin ? 'sistema' : (papeis[0] || 'comercial')
    const upErr = await atualizarSC(id, { status: 'cancelada' })
    if (upErr) return erro(upErr, 500)
    await registrarDecisao({
      scId: id, atorId: auth.userId, papel: meuPapel, tipo: 'cancelamento', justificativa,
      estadoAnterior: { status: sc.status }, estadoNovo: { status: 'cancelada' },
    })
    await notificarDecisao(sc as SolicitacaoCompra, await envolvidosSC(sc), auth.userId,
      `SC #${sc.numero} cancelada`, justificativa)
    return NextResponse.json({ ok: true })
  }

  return erro('Ação desconhecida')
}
