// GET /api/empresa/dre-gerencial[?recalcular=1] — DRE gerencial por setor dos últimos 6 meses (tela "Como está a empresa").
// A conta (src/lib/empresa/painel-gravado.ts → montarDreGerencialMeses) lê os lançamentos do DRE do Omie pela mesma porta
// do módulo DRE, tira as vendas NOVA ↔ CASTRO e aplica as regras de src/lib/empresa/dre-gerencial.ts. Desde 11/11 a tela
// lê o resultado gravado pelo robô `empresa-snapshot` em empresa_painel (José: "salvar em tabelas para não demorar").
// Permissão: a mesma do DRE (guardarDre) — os valores são do financeiro.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { lerArea } from '@/lib/empresa/painel-gravado'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  try {
    // ?meses=24 → os 24 meses (tela de Despesas compara anos); sem nada → os 6 da tela inicial
    const area = req.nextUrl.searchParams.get('meses') === '24' ? 'dre-24' : 'dre-gerencial'
    const r = await lerArea(area, req.nextUrl.searchParams.get('recalcular') === '1')
    return NextResponse.json({ ...(r.dados as object), calculadoEm: r.calculadoEm }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 })
  }
}
