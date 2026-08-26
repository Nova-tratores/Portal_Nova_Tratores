// GET /api/ppv/revisoes/margem/:cod_trator/:horas — detalhe item a item da célula.
// :horas é o marco (50..3000); o kit distinto é resolvido por kitDeHoras.
import { NextRequest, NextResponse } from 'next/server'
import { detalheCelula } from '@/lib/revisoes/margem-server'
import type { Pagador } from '@/lib/revisoes/margem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGADORES: Pagador[] = ['cliente', 'fabrica', 'cortesia_loja']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cod_trator: string; horas: string }> }
) {
  try {
    const { cod_trator, horas } = await params
    const sp = req.nextUrl.searchParams
    const pagadorRaw = sp.get('pagador')
    const pagador = pagadorRaw && PAGADORES.includes(pagadorRaw as Pagador) ? (pagadorRaw as Pagador) : undefined
    const comissaoRaw = sp.get('comissao')
    const pctComissao = comissaoRaw != null && Number.isFinite(parseFloat(comissaoRaw)) ? parseFloat(comissaoRaw) : undefined

    const marco = parseInt(horas, 10) || 0
    if (!marco) return NextResponse.json({ error: 'horas inválidas' }, { status: 400 })

    const detalhe = await detalheCelula(decodeURIComponent(cod_trator), marco, { pagador, pctComissao })
    if (!detalhe) return NextResponse.json({ error: 'Kit não encontrado' }, { status: 404 })
    return NextResponse.json(detalhe)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
