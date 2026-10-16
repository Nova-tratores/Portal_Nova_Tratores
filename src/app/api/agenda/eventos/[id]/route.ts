// AGENDA COLETIVA — um compromisso.
// GET → { evento } (link da notificação abre o dia certo)
// PATCH { acao:'editar', ...corpo de validarEvento }        (quem criou ou admin)
// PATCH { acao:'mover', inicio, fim }  (timestamptz ISO)     (quem criou ou admin; série inteira)
// PATCH { acao:'responder', resposta:'sim'|'nao'|'talvez' }  (convidado)
// DELETE ?dia=YYYY-MM-DD → só esta ocorrência da série; sem dia → o compromisso todo
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, type Autenticado } from '@/lib/auth/server'
import { carregarEvento, editarEvento, moverEvento, responderEvento, excluirEvento, migrationFaltou, MSG_MIGRATION_AGENDA, type EventoDb } from '@/lib/agenda/server'
import { validarEvento, DIA_RE, type Resposta } from '@/lib/agenda/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const dono = (auth: Autenticado, e: EventoDb) => auth.isAdmin || e.criado_por === auth.userId
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/

function falha(e: unknown, ctx: string) {
  if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_AGENDA }, { status: 503 })
  if ((e as { code?: string }).code === 'NAO_CONVIDADO') return NextResponse.json({ error: (e as Error).message }, { status: 403 })
  console.error(`[agenda/eventos/id] ${ctx}`, e)
  return NextResponse.json({ error: 'Falha ao salvar' }, { status: 500 })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params
  try {
    const ev = await carregarEvento(id)
    if (!ev) return NextResponse.json({ error: 'Compromisso não encontrado (pode ter sido cancelado).' }, { status: 404 })
    return NextResponse.json({ evento: ev })
  } catch (e) { return falha(e, 'GET') }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const ev = await carregarEvento(id)
    if (!ev) return NextResponse.json({ error: 'Compromisso não encontrado (pode ter sido cancelado).' }, { status: 404 })
    if (body.acao === 'responder') {
      const r = body.resposta as Resposta
      if (!['sim', 'nao', 'talvez'].includes(r)) return NextResponse.json({ error: 'Resposta inválida.' }, { status: 400 })
      await responderEvento(auth, ev, r)
      return NextResponse.json({ ok: true })
    }
    if (!dono(auth, ev)) return NextResponse.json({ error: 'Só quem criou o compromisso pode mudar.' }, { status: 403 })
    if (body.acao === 'mover') {
      const inicio = String(body.inicio || ''), fim = String(body.fim || '')
      if (!ISO.test(inicio) || !ISO.test(fim) || new Date(fim) <= new Date(inicio)) return NextResponse.json({ error: 'Horário inválido.' }, { status: 400 })
      return NextResponse.json({ evento: await moverEvento(auth, ev, inicio, fim) })
    }
    const v = validarEvento(body)
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
    return NextResponse.json({ evento: await editarEvento(auth, ev, v.campos) })
  } catch (e) { return falha(e, 'PATCH') }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params
  const dia = req.nextUrl.searchParams.get('dia')
  try {
    const ev = await carregarEvento(id)
    if (!ev) return NextResponse.json({ error: 'Compromisso não encontrado.' }, { status: 404 })
    if (!dono(auth, ev)) return NextResponse.json({ error: 'Só quem criou o compromisso pode excluir.' }, { status: 403 })
    await excluirEvento(auth, ev, dia && DIA_RE.test(dia) ? dia : null)
    return NextResponse.json({ ok: true })
  } catch (e) { return falha(e, 'DELETE') }
}
