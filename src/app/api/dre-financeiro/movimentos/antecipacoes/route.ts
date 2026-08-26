// =============================================================================
// API: movimentos/antecipacoes - reconstrói as OPERAÇÕES de desconto de
// duplicatas a partir da conta corrente virtual "Omie Desconto de Duplicatas"
// (tabela movimentos_cc).
//
// Modelo do Omie: cada duplicata ENTRA pelo valor cheio (R/EXTR); a liberação
// SAI como transferência do líquido (P/TRAP) + lançamento de juros (P/EXTP),
// e esses dois compartilham o MESMO cNumTitulo (timestamp) => pareamento exato.
// As duplicatas NÃO têm vínculo explícito com a liberação: a operação varre o
// saldo acumulado da conta. Reconstruímos por FIFO cronológico (cNumTitulo):
//  - valor cheio / juros / líquido / taxa da OPERAÇÃO são exatos;
//  - o líquido POR DUPLICATA é estimado (rateio pela taxa da operação).
// A fila é reconstruída desde 2025-01-01 (início do backfill) para o saldo
// carregar entre períodos; a 1ª operação pode incluir saldo anterior a isso
// (flag `incompleta`).
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { CONTA_PADRAO } from '@/lib/dre-financeiro/calc'
// @ts-ignore - modulo CommonJS sem tipos
import { labelConta } from '@/lib/dre-financeiro/omie-api'
import { fmtISO, inicioMes, fimMes } from '@/lib/dre-financeiro/dates'

export const dynamic = 'force-dynamic'

const BASE_FILA = '2025-01-01' // início do histórico sincronizado de movimentos_cc

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
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const now = new Date()
    const ini = sp.get('de') || fmtISO(inicioMes(now.getFullYear(), now.getMonth() + 1))
    const fim = sp.get('ate') || fmtISO(fimMes(now.getFullYear(), now.getMonth() + 1))

    // Busca TODOS os movimentos das contas "Desconto de Duplicatas" desde a
    // base (a fila precisa do histórico), paginando o corte de 1000 do PostgREST.
    const PAGE = 1000
    const movs: any[] = []
    for (let off = 0; off < 30000; off += PAGE) {
      let q = supabase.from('movimentos_cc')
        .select('natureza,conta_omie,codigo_conta_corrente,nome_conta_corrente,data_pagamento,valor_pago,nome_cliente_fornecedor,descricao_categoria,codigo_movimento,ts:raw->detalhes->>cNumTitulo')
        .ilike('nome_conta_corrente', '%Desconto de Duplicata%')
        .gte('data_pagamento', BASE_FILA)
        .lte('data_pagamento', fim)
        .order('id', { ascending: true })
        .range(off, off + PAGE - 1)
      if (conta !== 'todas') q = q.eq('conta_omie', labelConta(conta))
      const { data, error } = await q
      if (error) throw new Error(error.message)
      movs.push(...(data || []))
      if (!data || data.length < PAGE) break
    }

    // Chave de ordenação cronológica: cNumTitulo é 'YYYYMMDDHHMMSS' do lançamento.
    const ordem = (m: any) =>
      (m.ts && /^\d{14}$/.test(m.ts) ? m.ts : String(m.data_pagamento || '').replace(/-/g, '') + '000000')
      + String(m.codigo_movimento).padStart(16, '0')

    // Agrupa por conta corrente (NOVA e CASTRO têm contas de desconto próprias).
    const grupos = new Map<string, any[]>()
    movs.forEach((m) => {
      const k = `${m.conta_omie}|${m.codigo_conta_corrente}`
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k)!.push(m)
    })

    const operacoes: any[] = []
    const pendentes: any[] = []
    grupos.forEach((lista) => {
      lista.sort((a, b) => ordem(a) < ordem(b) ? -1 : 1)

      // Liberações: agrupa os P pelo cNumTitulo (transferência + juros da mesma
      // operação compartilham o timestamp). P sem par vira operação só de
      // líquido (juros 0) ou só de juros (tarifa avulsa).
      const libsMap = new Map<string, any>()
      const entradas: any[] = []
      lista.forEach((m) => {
        const v = Number(m.valor_pago) || 0
        if (!v) return
        if (m.natureza === 'R') {
          entradas.push({
            ord: ordem(m), data: m.data_pagamento,
            cliente: m.nome_cliente_fornecedor || '(sem nome)',
            valorOriginal: v, restante: v,
          })
          return
        }
        const key = m.ts || `${m.data_pagamento}|${m.codigo_movimento}`
        if (!libsMap.has(key)) {
          libsMap.set(key, {
            ord: ordem(m), data: m.data_pagamento,
            conta_omie: m.conta_omie, contaCorrente: m.nome_conta_corrente,
            liquido: 0, juros: 0,
          })
        }
        const lib = libsMap.get(key)!
        if (/transfer/i.test(m.descricao_categoria || '')) lib.liquido += v
        else lib.juros += v
      })
      const libs = Array.from(libsMap.values()).sort((a, b) => a.ord < b.ord ? -1 : 1)

      // FIFO: cada liberação consome (líquido + juros) = valor cheio da fila
      // de duplicatas lançadas até aquele momento.
      let iEnt = 0
      const fila: any[] = []
      libs.forEach((lib) => {
        while (iEnt < entradas.length && entradas[iEnt].ord <= lib.ord) fila.push(entradas[iEnt++])
        const cheio = lib.liquido + lib.juros
        const taxa = cheio > 0 ? lib.juros / cheio : 0
        const dups: any[] = []
        let faltando = cheio
        while (faltando > 0.009 && fila.length) {
          const d = fila[0]
          const usa = Math.min(d.restante, faltando)
          d.restante -= usa
          faltando -= usa
          dups.push({
            cliente: d.cliente, dataEntrada: d.data,
            valorOriginal: d.valorOriginal, valorNaOperacao: usa,
            liquidoEstimado: usa * (1 - taxa),
            parcial: usa < d.valorOriginal - 0.009,
          })
          if (d.restante <= 0.009) fila.shift()
        }
        operacoes.push({
          data: lib.data, conta_omie: lib.conta_omie, contaCorrente: lib.contaCorrente,
          valorCheio: cheio, juros: lib.juros, liquido: lib.liquido,
          taxaPct: taxa * 100,
          duplicatas: dups,
          // Fila não cobriu o valor: parte da operação veio de duplicatas
          // anteriores a BASE_FILA (ou lançadas fora da conta de desconto).
          incompleta: faltando > 0.009,
          valorSemOrigem: faltando > 0.009 ? faltando : 0,
        })
      })
      // Sobra na fila = duplicatas descontadas aguardando liberação (saldo na conta).
      while (iEnt < entradas.length) fila.push(entradas[iEnt++])
      fila.forEach((d) => {
        if (d.restante > 0.009) {
          pendentes.push({ conta_omie: lista[0].conta_omie, cliente: d.cliente, data: d.data, valor: d.restante })
        }
      })
    })

    // Só as operações do período pedido (a fila usou o histórico inteiro).
    const doPeriodo = operacoes
      .filter((o) => o.data >= ini && o.data <= fim)
      .sort((a, b) => a.data < b.data ? 1 : -1)

    let cheio = 0, juros = 0, liquido = 0, nDups = 0
    doPeriodo.forEach((o) => { cheio += o.valorCheio; juros += o.juros; liquido += o.liquido; nDups += o.duplicatas.length })

    return NextResponse.json({
      conta, de: ini, ate: fim,
      operacoes: doPeriodo,
      pendentes: pendentes.sort((a, b) => a.data < b.data ? 1 : -1),
      totais: {
        operacoes: doPeriodo.length, duplicatas: nDups,
        valorCheio: cheio, juros, liquido,
        taxaMediaPct: cheio > 0 ? (juros / cheio) * 100 : 0,
      },
    })
  } catch (e: any) {
    console.error('movimentos/antecipacoes:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
