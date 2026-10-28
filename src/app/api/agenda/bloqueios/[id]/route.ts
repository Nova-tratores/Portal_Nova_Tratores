// AGENDA PESSOAL — DELETE /api/agenda/bloqueios/:id (só o dono).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { apagarBloqueio, migrationFaltou, MSG_MIGRATION_BLOQUEIOS } from '@/lib/agenda/bloqueios-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  try {
    const apagou = await apagarBloqueio(auth.userId, id)
    if (!apagou) return NextResponse.json({ error: 'Bloqueio não encontrado.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_BLOQUEIOS }, { status: 503 })
    console.error('[agenda/bloqueios] DELETE', e)
    return NextResponse.json({ error: 'Falha ao liberar o horário' }, { status: 500 })
  }
}
