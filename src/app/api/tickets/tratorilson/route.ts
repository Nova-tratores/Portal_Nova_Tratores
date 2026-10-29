// Tratorilson organiza a semana de tickets (José, 29/10/2026) — lib/tickets/tratorilson-server.ts.
// GET  → { ligado, tabela, admin, desligadoParaMim, perguntas }   (todo logado: o popup das perguntas usa)
// POST { acao: 'config', ligado }              → chave geral (admin)
//      { acao: 'optout', desligado }           → cada pessoa liga/desliga para si
//      { acao: 'responder', perguntaId, ticketId|null } → resposta do popup (reorganiza na hora)
//      { acao: 'organizar_agora' }             → organiza a semana de quem pediu
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import {
  estaDesligadoPara, gravarConfig, gravarOptout, lerConfig, organizarTickets, perguntasPendentes, responderPergunta,
} from '@/lib/tickets/tratorilson-server'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Faça login.' }, { status: 401 })
  const cfg = await lerConfig()
  if (!cfg.tabela) return NextResponse.json({ ligado: false, tabela: false, admin: auth.isAdmin, desligadoParaMim: false, perguntas: [] })
  const [desligadoParaMim, perguntas] = await Promise.all([
    estaDesligadoPara(auth.userId),
    cfg.ligado ? perguntasPendentes(auth.userId) : Promise.resolve([]),
  ])
  return NextResponse.json({ ligado: cfg.ligado, tabela: true, admin: auth.isAdmin, desligadoParaMim, perguntas: desligadoParaMim ? [] : perguntas })
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Faça login.' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const acao = String(body?.acao || '')
  const falha = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

  if (acao === 'config') {
    if (!auth.isAdmin) return falha('Só admin liga ou desliga para todos.', 403)
    const ligado = !!body.ligado
    const e = await gravarConfig(ligado, auth.email)
    if (e) return falha(e, 503)
    await registrarAuditLog({ userId: auth.userId, userName: auth.email || '', sistema: 'tickets', acao: 'tratorilson_organizar', detalhes: { ligado } })
    return NextResponse.json({ ok: true })
  }
  if (acao === 'optout') {
    const e = await gravarOptout(auth.userId, !!body.desligado)
    return e ? falha(e, 503) : NextResponse.json({ ok: true })
  }
  if (acao === 'responder') {
    const e = await responderPergunta(auth.userId, String(body.perguntaId || ''), body.ticketId ? String(body.ticketId) : null)
    return e ? falha(e) : NextResponse.json({ ok: true })
  }
  if (acao === 'organizar_agora') {
    if (await estaDesligadoPara(auth.userId)) return falha('Você desligou o Tratorilson para a sua semana.')
    const r = await organizarTickets({ soUsuario: auth.userId })
    return NextResponse.json({ ok: true, ...r })
  }
  return falha('Ação desconhecida.')
}
