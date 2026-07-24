import { NextRequest, NextResponse } from 'next/server'
import { calcularSaudeFinanceira, SAUDE_TTL_MS, CONTA_PADRAO } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// Cache em memoria (5min) espelhando o padrao da rota home/kpis. Best-effort:
// objeto module-level; pode nao persistir entre cold starts.
const _saudeCache: { data: any; ts: number; periodo: string | null } = { data: null, ts: 0, periodo: null }

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
    if (!force && _saudeCache.data && _saudeCache.periodo === conta && (now - _saudeCache.ts) < SAUDE_TTL_MS) {
      return NextResponse.json({ ..._saudeCache.data, cache: { hit: true, idade_seg: Math.round((now - _saudeCache.ts) / 1000), ttl_seg: Math.round(SAUDE_TTL_MS / 1000) } })
    }
    const t0 = Date.now()
    const out = await calcularSaudeFinanceira(conta)
    const dt = Date.now() - t0
    _saudeCache.data = out
    _saudeCache.ts = now
    _saudeCache.periodo = conta
    return NextResponse.json({ ...out, cache: { hit: false, calculo_ms: dt, ttl_seg: Math.round(SAUDE_TTL_MS / 1000) } })
  } catch (e: any) {
    console.error('saude:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
