import { NextRequest, NextResponse } from 'next/server'
import { CONTA_PADRAO, TIPO_PADRAO, TIPOS_VALIDOS } from '@/lib/dre-financeiro/calc'
import { buscarTitulosLista, type EixoLista } from '@/lib/dre-financeiro/lista'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

// pegaConta/pegaTipo reimplementados inline (le searchParams, senao cookie, senao padrao)
function pegaConta(request: NextRequest): string {
  const c = (
    request.nextUrl.searchParams.get('conta') ||
    request.cookies.get('conta')?.value ||
    CONTA_PADRAO
  ).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

function pegaTipo(request: NextRequest): string {
  const t = (
    request.nextUrl.searchParams.get('tipo') ||
    request.cookies.get('tipo')?.value ||
    TIPO_PADRAO
  ).toString().toLowerCase()
  return TIPOS_VALIDOS.has(t) ? t : 'pagar'
}

// Espelha req.query do Express: objeto plano com os filtros que calc.js le.
function montaQuery(request: NextRequest): Record<string, string> {
  const sp = request.nextUrl.searchParams
  const q: Record<string, string> = {}
  for (const k of ['status', 'fornecedor', 'categoria', 'departamento', 'grupo']) {
    const v = sp.get(k)
    if (v != null) q[k] = v
  }
  return q
}

// =============================================================================
// API: lista de titulos por intervalo (de+ate) - alimenta a visao em lista.
// A busca em si vive em @/lib/dre-financeiro/lista (compartilhada com o cron
// do relatorio semanal).
// =============================================================================
export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const conta = pegaConta(request)
    const tipo = pegaTipo(request)
    const q = montaQuery(request)
    const eixoRaw = request.nextUrl.searchParams.get('eixo')
    const eixo: EixoLista = eixoRaw === 'emissao' || eixoRaw === 'inclusao' ? eixoRaw : 'vencimento'
    const de = request.nextUrl.searchParams.get('de')
    const ate = request.nextUrl.searchParams.get('ate')
    if (!de || !ate) return NextResponse.json({ erro: 'informe de+ate' }, { status: 400 })

    const titulos = await buscarTitulosLista({ conta, tipo, de, ate, eixo, q })
    return NextResponse.json({ titulos, total: titulos.length })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
