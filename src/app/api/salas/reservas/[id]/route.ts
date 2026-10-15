// AGENDA DA SALA — PATCH /api/salas/reservas/:id { dia, inicio, fim, titulo, descricao? } · DELETE = cancelar.
// Só quem reservou ou admin. Reserva de reunião muda pela própria reunião.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { carregarReserva, editarReserva, cancelarReserva, podeMexer, migrationFaltou, MSG_MIGRATION_SALAS } from '@/lib/salas/server'
import { validarReserva, localDe, isoDe } from '@/lib/salas/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function preparar(req: NextRequest, id: string) {
  const auth = await autenticar(req)
  if (!auth) return { resp: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const r = await carregarReserva(id)
  if (!r || r.status !== 'ativa') return { resp: NextResponse.json({ error: 'Reserva não encontrada (ou já cancelada).' }, { status: 404 }) }
  if (!podeMexer(auth, r)) return { resp: NextResponse.json({ error: 'Só quem reservou (ou um admin) muda esta reserva.' }, { status: 403 }) }
  if (r.reuniao_id) return { resp: NextResponse.json({ error: 'Esta reserva é de uma reunião — mude o horário ou cancele pela própria reunião.' }, { status: 409 }) }
  return { auth, r }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const p = await preparar(req, id); if ('resp' in p) return p.resp
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const v = validarReserva(body, localDe(new Date().toISOString()))
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
    const res = await editarReserva(p.auth, p.r, { inicio: isoDe(v.campos.dia, v.campos.inicio), fim: isoDe(v.campos.dia, v.campos.fim), titulo: v.campos.titulo, descricao: v.campos.descricao })
    if ('conflito' in res) return NextResponse.json({ error: res.mensagem, conflito: res.conflito }, { status: 409 })
    return NextResponse.json({ reserva: res.reserva })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_SALAS }, { status: 503 })
    if ((e as { code?: string }).code === 'CONFLITO') return NextResponse.json({ error: (e as Error).message }, { status: 409 })
    console.error('[salas/reservas] PATCH', e)
    return NextResponse.json({ error: 'Falha ao alterar a reserva' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const p = await preparar(req, id); if ('resp' in p) return p.resp
    await cancelarReserva(p.auth, p.r)
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_SALAS }, { status: 503 })
    console.error('[salas/reservas] DELETE', e)
    return NextResponse.json({ error: 'Falha ao cancelar a reserva' }, { status: 500 })
  }
}
