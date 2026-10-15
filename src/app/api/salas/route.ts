// AGENDA DA SALA — GET /api/salas?de=YYYY-MM-DD&ate=YYYY-MM-DD[&sala=uuid] -> { salas, reservas, agora }
// Todo usuário logado lê (reservar não exige módulo).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { listarSalas, listarReservas, migrationFaltou, MSG_MIGRATION_SALAS } from '@/lib/salas/server'
import { localDe, addDias } from '@/lib/salas/regras'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const agora = localDe(new Date().toISOString())
  const sp = req.nextUrl.searchParams
  const de = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('de') || '') ? sp.get('de')! : agora.dia
  let ate = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('ate') || '') ? sp.get('ate')! : addDias(de, 6)
  if (ate < de) ate = de
  if (ate > addDias(de, 41)) ate = addDias(de, 41)
  try {
    const [salas, reservas] = await Promise.all([listarSalas(), listarReservas(de, ate, sp.get('sala'))])
    return NextResponse.json({ salas, reservas, agora, eu: auth.userId, admin: auth.isAdmin })
  } catch (e) {
    if (migrationFaltou(e)) return NextResponse.json({ salas: [], reservas: [], agora, eu: auth.userId, admin: auth.isAdmin, migracaoFaltando: true, error: MSG_MIGRATION_SALAS })
    console.error('[salas] GET', e)
    return NextResponse.json({ error: 'Falha ao carregar a agenda' }, { status: 500 })
  }
}
