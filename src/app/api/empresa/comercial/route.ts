// GET /api/empresa/comercial[?recalcular=1] — vendas de máquinas (12 meses), estoque, propostas, vendedores e metas
// da área Comercial da tela do diretor (/empresa). Lê o que o robô `empresa-snapshot` gravou em empresa_painel
// (src/lib/empresa/painel-gravado.ts); as metas vêm sempre na hora. ?recalcular=1 = "Atualizar agora".
// Permissão: a mesma do DRE (guardarDre), como o /api/empresa/dre-gerencial — os valores são do financeiro.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { lerComercial } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  try {
    return NextResponse.json(await lerComercial(req.nextUrl.searchParams.get('recalcular') === '1'), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
