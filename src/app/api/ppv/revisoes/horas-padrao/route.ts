// GET /api/ppv/revisoes/horas-padrao — lista as horas-padrão por (cod_trator, horas_kit).
// PUT /api/ppv/revisoes/horas-padrao — upsert de uma linha.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseFetch } from '@/lib/ppv/supabase'
import { TBL_HORAS } from '@/lib/revisoes/margem-server'
import { KITS_DISTINTOS, type Pagador } from '@/lib/revisoes/margem'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGADORES: Pagador[] = ['cliente', 'fabrica', 'cortesia_loja']

export async function GET() {
  try {
    const rows = await supabaseFetch<Record<string, unknown>[]>(`${TBL_HORAS}?select=*&order=cod_trator,horas_kit`)
    return NextResponse.json(rows || [])
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const codTrator = String(body.cod_trator || '').trim()
    const horasKit = parseInt(String(body.horas_kit), 10)
    if (!codTrator) return NextResponse.json({ error: 'cod_trator obrigatório' }, { status: 400 })
    if (!KITS_DISTINTOS.includes(horasKit as (typeof KITS_DISTINTOS)[number])) {
      return NextResponse.json({ error: 'horas_kit deve ser 50, 300, 600, 900 ou 1200' }, { status: 400 })
    }
    const pagador = PAGADORES.includes(body.pagador_padrao) ? body.pagador_padrao : 'cliente'
    const payload = {
      horas_padrao: Number.isFinite(parseFloat(body.horas_padrao)) ? parseFloat(body.horas_padrao) : 0,
      pagador_padrao: pagador,
      observacao: body.observacao ? String(body.observacao) : null,
    }

    const patched = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_HORAS}?cod_trator=eq.${encodeURIComponent(codTrator)}&horas_kit=eq.${horasKit}`,
      'PATCH',
      payload
    )
    if (!Array.isArray(patched) || patched.length === 0) {
      await supabaseFetch(TBL_HORAS, 'POST', [{ cod_trator: codTrator, horas_kit: horasKit, ...payload }])
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
