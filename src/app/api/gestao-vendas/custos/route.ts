// /api/gestao-vendas/custos — custos mensais por vendedor.
// GET  ?mes=&ano=&conta=            → registros do mês
// POST { nome, mes, ano, conta_omie, valores } → upsert (update por id se existir)
// POST { copiarDe: true, mes, ano, conta_omie } → copia registros do mês anterior

import { NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { buscarCustos, parseCompetencia, podeGestaoVendas } from '@/lib/gestao-vendas/server'
import { CAMPOS_CUSTO, type CampoCusto } from '@/lib/gestao-vendas/tipos'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const comp = parseCompetencia(new URL(request.url))
  if (!comp) return NextResponse.json({ error: 'Parâmetros mes/ano/conta inválidos' }, { status: 400 })

  try {
    const custos = await buscarCustos(comp.mes, comp.ano, comp.conta)
    return NextResponse.json({ custos })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}

type BodySalvar = {
  nome: string
  mes: number
  ano: number
  conta_omie: string
  valores: Partial<Record<CampoCusto, number>>
  copiarDe?: boolean
}

function mesAnterior(mes: number, ano: number): { mes: number; ano: number } {
  return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano }
}

export async function POST(request: Request) {
  const auth = await autenticar(request)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!podeGestaoVendas(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  let body: BodySalvar
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const mes = Number(body.mes)
  const ano = Number(body.ano)
  const conta = (body.conta_omie || '').toUpperCase()
  if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano) || (conta !== 'NOVA' && conta !== 'CASTRO')) {
    return NextResponse.json({ error: 'mes/ano/conta_omie inválidos' }, { status: 400 })
  }

  try {
    // ---- copiar do mês anterior ----
    if (body.copiarDe) {
      const ant = mesAnterior(mes, ano)
      const [anteriores, atuais] = await Promise.all([
        buscarCustos(ant.mes, ant.ano, conta),
        buscarCustos(mes, ano, conta),
      ])
      const jaExistem = new Set(atuais.map((r) => r.nome))
      const novos = anteriores
        .filter((r) => !jaExistem.has(r.nome))
        .map((r) => ({
          nome: r.nome,
          mes,
          ano,
          conta_omie: conta,
          salario: r.salario,
          encargos: r.encargos,
          custos_extras: r.custos_extras,
          carro_aluguel: r.carro_aluguel,
          combustivel: r.combustivel,
          manutencao: r.manutencao,
        }))
      if (novos.length) {
        const { error } = await supabaseAdmin.from('comissao_custos_vendedor').insert(novos)
        if (error) throw new Error(error.message)
      }
      return NextResponse.json({ copiados: novos.length })
    }

    // ---- salvar campos de um vendedor ----
    if (!body.nome) return NextResponse.json({ error: 'nome obrigatório' }, { status: 400 })
    const valores: Partial<Record<CampoCusto, number>> = {}
    for (const c of CAMPOS_CUSTO) {
      const v = body.valores?.[c]
      if (v !== undefined) valores[c] = Number(v) || 0
    }

    const { data: existente } = await supabaseAdmin
      .from('comissao_custos_vendedor')
      .select('id')
      .eq('nome', body.nome)
      .eq('mes', mes)
      .eq('ano', ano)
      .ilike('conta_omie', conta)
      .maybeSingle()

    if (existente?.id) {
      const { data, error } = await supabaseAdmin
        .from('comissao_custos_vendedor')
        .update(valores)
        .eq('id', existente.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ custo: data })
    }
    const { data, error } = await supabaseAdmin
      .from('comissao_custos_vendedor')
      .insert({ nome: body.nome, mes, ano, conta_omie: conta, ...valores })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ custo: data })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erro' }, { status: 500 })
  }
}
