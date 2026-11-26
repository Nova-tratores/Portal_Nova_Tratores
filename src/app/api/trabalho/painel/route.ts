// PAINEL DE FLUXO (melhorias 6.2) — só admin (a Visão geral é da gerência).
// GET /api/trabalho/painel -> PainelFluxo (lib/trabalho/painel-server.ts). Gargalos = só números.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { painelFluxo } from '@/lib/trabalho/painel-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isAdmin) return NextResponse.json({ error: 'Só a gerência (admin) vê o painel.' }, { status: 403 })
  try { return NextResponse.json(await painelFluxo()) }
  catch (e) {
    console.error('[trabalho/painel] GET', e)
    return NextResponse.json({ error: 'Falha ao montar o painel' }, { status: 500 })
  }
}
