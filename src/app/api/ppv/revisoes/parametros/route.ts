// GET  /api/ppv/revisoes/parametros — vigência ativa dos parâmetros de cálculo.
// PUT  /api/ppv/revisoes/parametros — cria NOVA vigência (nunca update destrutivo):
//      encerra a atual (vigencia_fim = hoje) e insere uma linha nova com os
//      valores atuais + overrides do corpo.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseFetch } from '@/lib/ppv/supabase'
import { TBL_PARAMS } from '@/lib/revisoes/margem-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CAMPOS = [
  'valor_hora_cliente', 'valor_hora_garantia', 'tarifa_km', 'salario_base', 'fator_encargos',
  'horas_uteis_mes', 'pct_servico', 'pct_deslocamento', 'velocidade_media_kmh', 'custo_combustivel_km',
  'custo_manutencao_km', 'aliquota_iss', 'aliquota_pis_cofins', 'cmc_liquido_de_impostos', 'pct_credito_cmc',
  'comissao_min', 'comissao_max', 'comissao_media', 'fator_realizacao_km', 'fator_realizacao_horas', 'origem_fatores',
] as const

async function vigenteRaw(): Promise<Record<string, unknown> | null> {
  const rows = await supabaseFetch<Record<string, unknown>[]>(
    `${TBL_PARAMS}?vigencia_fim=is.null&order=id.desc&limit=1`
  )
  return rows && rows.length ? rows[0] : null
}

export async function GET() {
  try {
    const row = await vigenteRaw()
    if (!row) return NextResponse.json({ error: 'Nenhuma vigência ativa — rode sql/create-revisoes-margem.sql' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const cur = await vigenteRaw()
    if (!cur) return NextResponse.json({ error: 'Nenhuma vigência ativa' }, { status: 404 })

    const hoje = new Date().toISOString().slice(0, 10)
    const nova: Record<string, unknown> = { vigencia_inicio: hoje, vigencia_fim: null }
    for (const c of CAMPOS) nova[c] = c in body ? body[c] : cur[c]

    // Encerra a atual ANTES de inserir a nova (índice único garante 1 ativa).
    await supabaseFetch(`${TBL_PARAMS}?vigencia_fim=is.null`, 'PATCH', { vigencia_fim: hoje })
    const ins = await supabaseFetch<Record<string, unknown>[]>(TBL_PARAMS, 'POST', [nova])
    return NextResponse.json(Array.isArray(ins) ? ins[0] : ins)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
