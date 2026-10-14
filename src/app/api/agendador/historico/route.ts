// Histórico das execuções (cron_runs) para a tela /agendamentos. Admin ou Dev.
// GET /api/agendador/historico?job=&status=&dias=7&limite=200
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { historico } from '@/lib/agendador/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isAdmin && !auth.isDev) return NextResponse.json({ error: 'Só admin vê os agendamentos.' }, { status: 403 })
  const p = req.nextUrl.searchParams
  try {
    const rodadas = await historico({
      job: p.get('job') || undefined,
      status: p.get('status') || undefined,
      dias: Number(p.get('dias')) || 7,
      limite: Number(p.get('limite')) || 200,
    })
    return NextResponse.json({ rodadas })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
