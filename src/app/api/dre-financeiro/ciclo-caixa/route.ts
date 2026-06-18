import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// calc.js e CommonJS server-side (service key + segredos Omie)
import { calcularCicloCaixa } from '@/lib/dre-financeiro/calc'

// Port fiel de: app.get('/api/ciclo-caixa') do server.js
// O handler nao usa conta/tipo: calcularCicloCaixa computa nova/castro/consolidado
// internamente. req.query.meses => searchParams 'meses'
// (a propria funcao faz parseInt e clamp 3..24, default 12).
export async function GET(request: NextRequest) {
  try {
    const meses = request.nextUrl.searchParams.get('meses')
    const r = await calcularCicloCaixa(meses)
    return NextResponse.json(r)
  } catch (e: any) {
    console.error('ciclo-caixa:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
