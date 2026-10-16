// Base do Centro do Pós-Vendas (José, 16/10/2026: "trocar a data tem que ser rápido, grava tudo
// no banco"). Devolve os dados brutos de 4 anos já gravados; a tela calcula cada período sozinha.
// GET [?forcar=1] → { de, ate, tecnicos, faturadas, diasTodos, osInternas, geradoEm }
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { baseComCache } from '@/lib/mecanicos/base-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  try {
    const r = await baseComCache(req.nextUrl.searchParams.get('forcar') === '1')
    return NextResponse.json({ ...r.dados, geradoEm: r.geradoEm })
  } catch (e) {
    console.error('[mecanicos/base]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao carregar a base' }, { status: 500 })
  }
}
