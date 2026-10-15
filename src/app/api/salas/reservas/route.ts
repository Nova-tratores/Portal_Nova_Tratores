// AGENDA DA SALA — POST /api/salas/reservas { sala_id?, dia, inicio:'HH:MM', fim:'HH:MM', titulo, descricao? }
// Conflito (o banco recusa sobreposição) → 409 { error: "Ocupada por …", conflito }.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { criarReserva, listarSalas, uuidValido, migrationFaltou, MSG_MIGRATION_SALAS } from '@/lib/salas/server'
import { validarReserva, localDe, isoDe } from '@/lib/salas/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const v = validarReserva(body, localDe(new Date().toISOString()))
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  try {
    const salas = await listarSalas()
    const salaId = uuidValido(body.sala_id) ? body.sala_id : salas[0]?.id
    if (!salaId || !salas.some((s) => s.id === salaId)) return NextResponse.json({ error: 'Sala não encontrada.' }, { status: 404 })
    const r = await criarReserva(auth, {
      sala_id: salaId, inicio: isoDe(v.campos.dia, v.campos.inicio), fim: isoDe(v.campos.dia, v.campos.fim),
      titulo: v.campos.titulo, descricao: v.campos.descricao,
    })
    if ('conflito' in r) return NextResponse.json({ error: r.mensagem, conflito: r.conflito }, { status: 409 })
    return NextResponse.json({ reserva: r.reserva })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_SALAS }, { status: 503 })
    if ((e as { code?: string }).code === 'CONFLITO') return NextResponse.json({ error: (e as Error).message }, { status: 409 })
    console.error('[salas/reservas] POST', e)
    return NextResponse.json({ error: 'Falha ao reservar' }, { status: 500 })
  }
}
