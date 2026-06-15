// =============================================================================
// API: margem bruta operacional - port FIEL de GET /api/lucratividade/margem do
// server.js (linhas 3816-3829). Receita = valor_total, CMV = cmc_unitario x qty.
// Agrega por mes/semestre/ano (gran) e por familia.
// req.query.meses/gran/desde => searchParams; clamp meses 3..60, default 12;
// gran em {mes,semestre,ano} default 'mes'. calcularMargem acessa supabase.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO, calcularMargem } from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// pegaConta reimplementado inline (server.js:68-77): le searchParams 'conta',
// senao cookie, senao default. Valores: nova|castro|todas.
function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const sp = request.nextUrl.searchParams
    const meses = Math.max(3, Math.min(60, parseInt(sp.get('meses') as string, 10) || 12))
    const granRaw = sp.get('gran') || ''
    const gran = ['mes', 'semestre', 'ano'].includes(granRaw) ? granRaw : 'mes'
    const desde = sp.get('desde') || ''
    const r = await calcularMargem(conta, meses, gran, desde)
    // 'meses' (array) vem de ...r e sobrescrevia o scalar meses no Express (server.js:3824);
    // mantemos esse comportamento descartando a chave scalar duplicada.
    return NextResponse.json({ conta, gran, desde, ...r })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
