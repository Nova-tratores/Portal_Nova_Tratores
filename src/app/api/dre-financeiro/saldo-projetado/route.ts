import { NextRequest, NextResponse } from 'next/server'
import {
  CONTA_PADRAO,
  tabelaPorTipo,
  aplicarConta,
} from '@/lib/dre-financeiro/calc'
import { fmtISO, hoje, addDias } from '@/lib/dre-financeiro/dates'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

// pegaConta reimplementado inline (le searchParams, senao cookie, senao padrao)
function pegaConta(request: NextRequest): string {
  const c = (
    request.nextUrl.searchParams.get('conta') ||
    request.cookies.get('conta')?.value ||
    CONTA_PADRAO
  ).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

// =============================================================================
// API: curva de saldo projetado (fluxo de caixa acumulado dia-a-dia)
// =============================================================================
export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const db = supabase // captura nao-null para uso no closure buscaTipo
  try {
    const conta = pegaConta(request)
    const dias = Math.max(7, Math.min(365, parseInt(request.nextUrl.searchParams.get('dias') || '', 10) || 90))
    const inicial = parseFloat(request.nextUrl.searchParams.get('inicial') || '') || 0

    const ref = hoje()
    const dataInicio = fmtISO(ref)
    const dataFim = fmtISO(addDias(ref, dias))

    // Busca pagar e receber dentro do range
    async function buscaTipo(tipo: string) {
      const tabela = tabelaPorTipo(tipo)
      let q = db.from(tabela)
        .select('data_vencimento,valor_documento,valor_pago,data_pagamento')
        .gte('data_vencimento', dataInicio)
        .lte('data_vencimento', dataFim)
        .limit(50000)
      q = aplicarConta(q, conta)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data || []
    }

    const [pagarRows, receberRows] = await Promise.all([
      buscaTipo('pagar'),
      buscaTipo('receber')
    ])

    // Agrega valores em aberto (valor_documento - valor_pago) por dia
    const porDia: Record<string, any> = {}
    function acumula(rows: any[], lado: string) {
      rows.forEach((r: any) => {
        const aberto = (Number(r.valor_documento) || 0) - (Number(r.valor_pago) || 0)
        if (aberto <= 0) return // ja liquidado
        const k = r.data_vencimento
        if (!k) return
        if (!porDia[k]) porDia[k] = { data: k, entradas: 0, saidas: 0 }
        if (lado === 'entrada') porDia[k].entradas += aberto
        else porDia[k].saidas += aberto
      })
    }
    acumula(pagarRows, 'saida')
    acumula(receberRows, 'entrada')

    // Gera serie diaria continua (preenche dias sem titulos)
    const pontos: any[] = []
    let saldo = inicial
    let saldoMin = inicial, saldoMax = inicial
    const diasNegativos: any[] = []
    for (let i = 0; i <= dias; i++) {
      const dt = fmtISO(addDias(ref, i))
      const slot = porDia[dt] || { data: dt, entradas: 0, saidas: 0 }
      const saldoDoDia = slot.entradas - slot.saidas
      saldo += saldoDoDia
      if (saldo < saldoMin) saldoMin = saldo
      if (saldo > saldoMax) saldoMax = saldo
      const ponto = {
        data: dt,
        entradas: slot.entradas,
        saidas: slot.saidas,
        saldoDoDia,
        saldoAcumulado: saldo
      }
      pontos.push(ponto)
      if (saldo < 0) diasNegativos.push({ data: dt, saldo })
    }

    return NextResponse.json({
      inicial,
      dias,
      conta,
      dataInicio,
      dataFim,
      pontos,
      diasNegativos,
      saldoFinal: saldo,
      saldoMin,
      saldoMax,
      totalEntradas: pontos.reduce((a, p) => a + p.entradas, 0),
      totalSaidas: pontos.reduce((a, p) => a + p.saidas, 0)
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
