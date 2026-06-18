import { NextRequest, NextResponse } from 'next/server'
import { calcularKpisHome, HOME_TTL_MS, CONTA_PADRAO } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// Cache em memoria (5min) espelhando _homeKpisCache do server.js original.
// Best-effort: objeto module-level; pode nao persistir entre cold starts.
const _homeKpisCache: { data: any; ts: number; periodo: string | null } = { data: null, ts: 0, periodo: null }

// pegaConta inline (BRIEF): le searchParams 'conta', senao cookie 'conta', senao CONTA_PADRAO.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta') || request.cookies.get('conta')?.value || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

export async function GET(request: NextRequest) {
  try {
    const conta = pegaConta(request)
    const force = request.nextUrl.searchParams.get('refresh') === '1'
    const now = Date.now()
    if (!force && _homeKpisCache.data && _homeKpisCache.periodo === conta && (now - _homeKpisCache.ts) < HOME_TTL_MS) {
      return NextResponse.json({ ..._homeKpisCache.data, cache: { hit: true, idade_seg: Math.round((now - _homeKpisCache.ts) / 1000), ttl_seg: Math.round(HOME_TTL_MS / 1000) } })
    }
    const t0 = Date.now()
    const out = await calcularKpisHome(conta)
    const dt = Date.now() - t0
    _homeKpisCache.data = out
    _homeKpisCache.ts = now
    _homeKpisCache.periodo = conta
    return NextResponse.json({ ...out, cache: { hit: false, calculo_ms: dt, ttl_seg: Math.round(HOME_TTL_MS / 1000) } })
  } catch (e: any) {
    console.error('home kpis:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
