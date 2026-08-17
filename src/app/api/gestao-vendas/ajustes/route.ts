// POST /api/gestao-vendas/ajustes — grava um ajuste de venda (vendedor, custos
// extras, desconto, % comissão). O servidor recalcula comissão/margem a partir
// dos campos brutos (não confia nos valores derivados vindos do cliente).

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { podeGestaoVendas } from '@/lib/gestao-vendas/server'
import { calcular, dataBrParaIso } from '@/lib/gestao-vendas/calculos'

export const runtime = 'nodejs'

type Body = {
  id?: number | null // id do ajuste existente (update); ausente = insert
  conta_omie: string
  venda_id: string
  // dados da venda (contexto)
  data_pedido?: string | null
  mes: number
  ano: number
  cliente?: string | null
  familia?: string | null
  categoria?: string | null
  departamento?: string | null
  produto_descricao?: string | null
  valor_venda: number
  cmc_total: number // CMC do snapshot (cmc_unitario * qtd)
  cmc_override?: number | null // CMC total corrigido à mão; null = usa snapshot
  // campos editáveis
  vendedor?: string | null
  custos_extras?: number
  custos_extras_desc?: string | null
  desconto?: number
  desconto_desc?: string | null
  comissao_override_pct?: number | null
  comissao_pct_base?: number // pct vigente quando não há override
}

export async function POST(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (!body?.venda_id || !body.conta_omie || !Number.isFinite(body.valor_venda)) {
    return NextResponse.json({ error: 'Campos obrigatórios: venda_id, conta_omie, valor_venda' }, { status: 400 })
  }

  const custos_extras = Number(body.custos_extras) || 0
  const desconto = Number(body.desconto) || 0
  const override = body.comissao_override_pct == null ? null : Number(body.comissao_override_pct)
  const comissao_pct = override ?? Number(body.comissao_pct_base) ?? 0

  // CMC efetivo: override manual quando presente, senão o snapshot do sync
  const cmc_override =
    body.cmc_override == null || !Number.isFinite(Number(body.cmc_override))
      ? null
      : Number(body.cmc_override)
  const cmc_total_efetivo = cmc_override ?? (Number(body.cmc_total) || 0)

  const calc = calcular({
    valor_venda: body.valor_venda,
    cmc_total: cmc_total_efetivo,
    custos_extras,
    desconto,
    comissao_pct: comissao_pct || 0,
  })

  const payload = {
    conta_omie: body.conta_omie,
    venda_id: body.venda_id,
    data_venda: dataBrParaIso(body.data_pedido),
    mes: body.mes,
    ano: body.ano,
    cliente: body.cliente ?? null,
    vendedor: body.vendedor ?? null,
    familia: body.familia ?? null,
    categoria: body.categoria ?? null,
    departamento: body.departamento ?? null,
    produto_descricao: body.produto_descricao ?? null,
    cmc_total: cmc_total_efetivo,
    cmc_override,
    valor_venda: body.valor_venda,
    margem_bruta_pct: calc.margem_bruta_pct * 100,
    custos_extras,
    custos_extras_desc: body.custos_extras_desc ?? null,
    desconto,
    desconto_desc: body.desconto_desc ?? null,
    comissao_override_pct: override,
    comissao_pct: comissao_pct || 0,
    valor_comissao: calc.valor_comissao,
    custo_total: calc.custo_total,
    venda_liquida: calc.venda_liquida,
    margem_loja: calc.margem_loja_valor,
    margem_loja_pct: calc.margem_loja_pct * 100,
    status: 'ajustado',
    usuario: auth.email,
  }

  try {
    if (body.id) {
      const { data, error } = await supabaseAdmin
        .from('comissao_ajustes_vendas')
        .update(payload)
        .eq('id', body.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ajuste: data })
    }
    const { data, error } = await supabaseAdmin
      .from('comissao_ajustes_vendas')
      .insert(payload)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ ajuste: data })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro ao salvar' },
      { status: 500 },
    )
  }
}
