// POST /api/ppv/revisoes/margem/snapshot — congela a matriz da competência.
// Corpo opcional: { competencia?: 'YYYY-MM-01', pagador?, comissao? }.
// Regrava a competência (delete + insert) para poder reexecutar no mês.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseFetch } from '@/lib/ppv/supabase'
import { montarMatriz, TBL_SNAP } from '@/lib/revisoes/margem-server'
import type { Pagador } from '@/lib/revisoes/margem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGADORES: Pagador[] = ['cliente', 'fabrica', 'cortesia_loja']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const hoje = new Date()
    const competencia =
      typeof body.competencia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.competencia)
        ? body.competencia
        : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`

    const pagador = PAGADORES.includes(body.pagador as Pagador) ? (body.pagador as Pagador) : undefined
    const pctComissao = Number.isFinite(parseFloat(String(body.comissao))) ? parseFloat(String(body.comissao)) : undefined

    const data = await montarMatriz({ pagador, pctComissao })

    const rows: Record<string, unknown>[] = []
    for (const linha of data.linhas) {
      for (const c of linha.celulas) {
        if (c.sem_kit) continue
        rows.push({
          competencia,
          cod_trator: linha.cod_trator,
          horas_kit: c.horas_kit,
          pagador: c.pagador,
          pecas_venda: c.pecas_venda,
          pecas_custo: c.pecas_custo,
          margem_pecas: c.margem_pecas,
          receita_mo_liquida: c.receita_mo_liquida,
          comissao: c.comissao,
          custo_mo: c.custo_mo,
          margem_mo: c.margem_mo,
          margem_nominal: c.margem_nominal,
          margem_realizada: c.margem_realizada,
          km_max: c.km_max,
          cobertura: c.cobertura,
          origem_kit: c.origem_kit,
          parametros_id: data.parametros_id,
        })
      }
    }

    await supabaseFetch(`${TBL_SNAP}?competencia=eq.${competencia}`, 'DELETE')
    if (rows.length) await supabaseFetch(TBL_SNAP, 'POST', rows)

    return NextResponse.json({ ok: true, competencia, linhas: rows.length })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
