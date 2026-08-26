// GET /api/ppv/revisoes/margem — matriz de margem (modelo × 5 kits).
// Filtros: ?modelo= ?pagador=cliente|fabrica|cortesia_loja ?comissao=0.15..0.30
import { NextRequest, NextResponse } from 'next/server'
import { montarMatriz } from '@/lib/revisoes/margem-server'
import type { Pagador } from '@/lib/revisoes/margem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGADORES: Pagador[] = ['cliente', 'fabrica', 'cortesia_loja']

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const pagadorRaw = sp.get('pagador')
    const pagador = pagadorRaw && PAGADORES.includes(pagadorRaw as Pagador) ? (pagadorRaw as Pagador) : undefined
    const comissaoRaw = sp.get('comissao')
    const pctComissao = comissaoRaw != null && Number.isFinite(parseFloat(comissaoRaw)) ? parseFloat(comissaoRaw) : undefined
    const modelo = sp.get('modelo') || undefined

    const data = await montarMatriz({ pagador, pctComissao, modelo })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
