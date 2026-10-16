// AGENDA COLETIVA — POST /api/agenda/eventos  (criar compromisso; corpo em validarEvento)
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { criarEvento, migrationFaltou, MSG_MIGRATION_AGENDA, ConflitoAgenda } from '@/lib/agenda/server'
import { validarEvento } from '@/lib/agenda/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const v = validarEvento((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 })
  try {
    return NextResponse.json({ evento: await criarEvento(auth, v.campos) })
  } catch (e) {
    if (e instanceof ConflitoAgenda) return NextResponse.json({ error: `Horário ocupado: ${e.conflitos.join(' ')}`, conflitos: e.conflitos }, { status: 409 })
    if (migrationFaltou(e)) return NextResponse.json({ error: MSG_MIGRATION_AGENDA }, { status: 503 })
    console.error('[agenda/eventos] POST', e)
    return NextResponse.json({ error: 'Falha ao salvar o compromisso' }, { status: 500 })
  }
}
