// Pódio dos meses (José, 20/10/2026): comissão fechada no RH e pontos de cada mês. GET ?forcar=1 refaz (cache 10 min).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { podioMeses } from '@/lib/mecanicos/podio-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  try {
    return NextResponse.json(await podioMeses(12, req.nextUrl.searchParams.get('forcar') === '1'))
  } catch (e) {
    console.error('[mecanicos/podio]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao montar o pódio' }, { status: 500 })
  }
}
