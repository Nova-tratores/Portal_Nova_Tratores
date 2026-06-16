// =============================================================================
// API: monitor/anomalias - port FIEL de GET /api/monitor/anomalias do server.js
// (linhas 4159-4200). Lista anomalias + contagens agrupadas.
// Filtros opcionais: conta, modulo, status, severidade.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { labelConta } from '@/lib/dre-financeiro/omie-api'
import { selectPaginado } from '@/lib/dre-financeiro/calc'
import { MODULOS, MODULO_LABEL } from '@/lib/dre-financeiro/monitors'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const sb = supabase // narrowing nao-null flui p/ os closures de selectPaginado
  try {
    const sp = request.nextUrl.searchParams
    const conta = (sp.get('conta') || 'todas').toString().toLowerCase()
    const status = (sp.get('status') || 'aberta').toString()
    const modulo = sp.get('modulo') ? String(sp.get('modulo')) : null
    const severidade = sp.get('severidade') ? String(sp.get('severidade')) : null

    // Pagina alem do limite de 1000 do PostgREST (.limit nao supera o cap do servidor).
    // Order composto e estavel (data_ref + id) p/ paginacao sem pular linhas.
    const todas = await selectPaginado(() => {
      let q = sb.from('qa_anomalias').select('*')
        .order('data_ref', { ascending: false }).order('id', { ascending: true })
      if (conta !== 'todas') q = q.eq('conta_omie', labelConta(conta))
      if (status !== 'todas') q = q.eq('status', status)
      if (modulo) q = q.eq('modulo', modulo)
      if (severidade) q = q.eq('severidade', severidade)
      return q
    })
    const LIMITE_LISTA = 5000
    const data = todas.slice(0, LIMITE_LISTA)

    // Resumo por modulo/severidade (sempre sobre status=aberta, p/ os cards) - paginado p/ contagem exata.
    const abertas = await selectPaginado(() => {
      let rq = sb.from('qa_anomalias').select('modulo,conta_omie,severidade,regra')
        .eq('status', 'aberta').order('id', { ascending: true })
      if (conta !== 'todas') rq = rq.eq('conta_omie', labelConta(conta))
      return rq
    })

    const resumo: any = {}
    for (const m of MODULOS) resumo[m] = { total: 0, alta: 0, media: 0, baixa: 0, regras: {} }
    ;(abertas || []).forEach((a: any) => {
      const r = resumo[a.modulo] || (resumo[a.modulo] = { total: 0, alta: 0, media: 0, baixa: 0, regras: {} })
      r.total++; r[a.severidade] = (r[a.severidade] || 0) + 1
      r.regras[a.regra] = (r.regras[a.regra] || 0) + 1
    })

    return NextResponse.json({ anomalias: data || [], total: todas.length, truncada: todas.length > LIMITE_LISTA, resumo, modulosLabel: MODULO_LABEL })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
