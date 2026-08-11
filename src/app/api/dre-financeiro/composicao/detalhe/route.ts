// =============================================================================
// API: composicao/detalhe - drill-down de UM terceiro (cliente/fornecedor) de
// uma categoria da tela de Composicao. Devolve os TITULOS individuais (nota,
// datas, valor, status) que somam o valor daquele terceiro naquela categoria.
//
// Alimenta o popup da /dre-financeiro/composicao quando o usuario clica numa
// barra de cliente/fornecedor: "mostra a lista do que compoe aquele valor".
//
// Filtra pela MESMA logica da rota /api/dre-financeiro/composicao (mesmo periodo
// por data_vencimento, mesmo tratamento de grupo/categoria/terceiro e o mesmo
// corte de valor <= 0), pra a soma dos titulos bater com a barra do treemap.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, tabelaPorTipo, colunaNomePorTipo, aplicarConta,
  ehDescontoDuplicataAPIP, GRUPO_COMPOSICAO_ANTECIP,
} from '@/lib/dre-financeiro/calc'

export const dynamic = 'force-dynamic'

// Sentinelas iguais aos da rota /composicao: la um grupo/categoria/terceiro
// nulo vira este rotulo; aqui traduzimos de volta pra `is(coluna, null)`.
const SEM_GRUPO = 'Sem grupo'
const SEM_CAT = 'Sem categoria'
const SEM_TERC = 'Sem nome'
const PAG = 1000

function pegaConta(request: NextRequest): string {
  const c = (request.nextUrl.searchParams.get('conta')
    || request.cookies.get('conta')?.value
    || CONTA_PADRAO).toString().toLowerCase()
  if (c === 'todas') return 'todas'
  return c
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const db = supabase
  try {
    const sp = request.nextUrl.searchParams
    const conta = pegaConta(request)
    const tipo = sp.get('tipo') === 'receber' ? 'receber' : 'pagar'
    const de = sp.get('de') ? String(sp.get('de')) : ''
    const ate = sp.get('ate') ? String(sp.get('ate')) : ''
    const grupo = sp.get('grupo') || ''
    const categoria = sp.get('categoria') || ''
    const terceiro = sp.get('terceiro') || ''
    if (!de || !ate) return NextResponse.json({ erro: 'informe de/ate' }, { status: 400 })

    const tabela = tabelaPorTipo(tipo)
    const colNome = colunaNomePorTipo(tipo)

    // Query base filtrada por periodo + conta + grupo + terceiro. A categoria e'
    // filtrada em JS (o rotulo do treemap e' descricao||codigo, sem coluna unica).
    function base(sel: string, head = false) {
      let q = head
        ? db.from(tabela).select(sel, { count: 'exact', head: true })
        : db.from(tabela).select(sel)
      q = q.gte('data_vencimento', de).lte('data_vencimento', ate)
      q = aplicarConta(q, conta)
      // Bucket sintético de antecipação: não existe como grupo_categoria no DB —
      // são os 2.05.03 sob "Despesas Financeiras / Bancos"; o recorte APIP fica
      // no pós-filtro em JS (ehDescontoDuplicataAPIP) abaixo.
      if (grupo === GRUPO_COMPOSICAO_ANTECIP) q = q.eq('grupo_categoria', 'Despesas Financeiras / Bancos').eq('codigo_categoria', '2.05.03')
      else if (grupo === SEM_GRUPO) q = q.is('grupo_categoria', null)
      else if (grupo) q = q.eq('grupo_categoria', grupo)
      if (terceiro === SEM_TERC) q = q.is(colNome, null)
      else if (terceiro) q = q.eq(colNome, terceiro)
      return q
    }

    const { count, error: eCount } = await base('codigo_lancamento', true)
    if (eCount) throw new Error(eCount.message)
    const paginas = Math.ceil((count || 0) / PAG)
    const sel = `codigo_lancamento,numero_documento,numero_documento_fiscal,data_emissao,data_vencimento,data_pagamento,valor_documento,valor_pago,status_titulo,descricao_categoria,codigo_categoria,id_origem:raw->>id_origem`
    const reqs: Promise<any>[] = []
    for (let p = 0; p < paginas; p++) {
      const from = p * PAG
      // order estavel por codigo_lancamento (sem isso o range() pode repetir/pular
      // linhas na fronteira das paginas — mesmo motivo da rota /composicao).
      reqs.push(base(sel).order('codigo_lancamento').range(from, from + PAG - 1) as any)
    }
    const lotes = await Promise.all(reqs)
    const linhas: any[] = []
    for (const { data, error } of lotes) {
      if (error) throw new Error(error.message)
      if (data) linhas.push(...data)
    }

    // Filtra pela categoria clicada (mesma resolucao do treemap) e descarta
    // valor <= 0 (a rota /composicao ignora esses ao montar as folhas).
    const ehBucketAntecip = grupo === GRUPO_COMPOSICAO_ANTECIP
    const titulos = linhas
      .filter((r) => {
        if ((Number(r.valor_documento) || 0) <= 0) return false
        const cat = r.descricao_categoria || (r.codigo_categoria || SEM_CAT)
        if (cat !== categoria) return false
        // Espelha o split da rota /composicao: no bucket só entra APIP; no grupo
        // "Despesas Financeiras / Bancos" o APIP é excluído (foi pro bucket).
        if (ehBucketAntecip) return ehDescontoDuplicataAPIP(r)
        if (grupo === 'Despesas Financeiras / Bancos' && ehDescontoDuplicataAPIP(r)) return false
        return true
      })
      .map((r) => ({
        codigo_lancamento: r.codigo_lancamento,
        documento: r.numero_documento_fiscal || r.numero_documento || null,
        data_emissao: r.data_emissao || null,
        data_vencimento: r.data_vencimento || null,
        data_pagamento: r.data_pagamento || null,
        valor: Number(r.valor_documento) || 0,
        valor_pago: Number(r.valor_pago) || 0,
        status: r.status_titulo || null,
      }))
      .sort((a, b) => String(b.data_vencimento).localeCompare(String(a.data_vencimento)))

    const total = titulos.reduce((s, t) => s + t.valor, 0)
    return NextResponse.json({
      tipo, grupo, categoria, terceiro, de, ate,
      count: titulos.length, total, titulos,
    })
  } catch (e: any) {
    console.error('composicao/detalhe:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
