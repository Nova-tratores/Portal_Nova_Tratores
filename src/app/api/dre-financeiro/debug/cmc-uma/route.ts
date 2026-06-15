// =============================================================================
// API: debug/cmc-uma - port FIEL de GET /api/debug/cmc-uma do server.js
// (linhas 4428-4443). Consulta a PosicaoEstoque de UM produto numa data
// especifica (dd/MM/yyyy) direto na API Omie e devolve o raw + o cmc parseado.
// Ferramenta de debug do CMC (custo medio de compra). Exige ?conta=&codigo=&data=.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { omieRequest } from '@/lib/dre-financeiro/omie-api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const conta = (sp.get('conta') || '').toString().toLowerCase()
  const codigo = sp.get('codigo')
  const data = sp.get('data') // dd/MM/yyyy
  if (!conta || !codigo || !data) {
    return NextResponse.json({ erro: 'informe ?conta=&codigo=&data=dd/MM/yyyy' }, { status: 400 })
  }
  try {
    const r = await omieRequest('/estoque/consulta/', 'PosicaoEstoque', {
      id_prod: parseInt(codigo, 10),
      codigo_local_estoque: 0,
      data: data
    }, conta)
    return NextResponse.json({ ok: true, raw: r, cmc_parsed: parseFloat(r.cmc || 0) })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message, faultstring: e.faultstring }, { status: 500 })
  }
}
