// =============================================================================
// API: /api/ajustes/antecipacoes
// Lista os títulos a PAGAR da categoria "Pagamento de Empréstimos" (2.05.03),
// separando o DESCONTO DE DUPLICATA (antecipação via integração Omie) do resto
// (empréstimos/serviços/cartão) que caem na mesma categoria.
//
// Discriminador: raw.id_origem === 'APIP' => título gerado pela integração
// "Omie Desconto de Duplicatas" (parceiros: Banco Votorantim, ERG Risk, OMIE
// FIDC, ...). O valor desse título é o PRINCIPAL da duplicata descontada — NÃO
// é juro (por isso infla "Despesas Financeiras" na DRE). A origem (NF-e/NFS-e)
// vem de raw.chave_nfe + numero_documento_fiscal + raw.codigo_tipo_documento.
//
// Contraste de juros: os juros de antecipação são lançados fora de contas_pagar
// (na CC virtual "Omie Desconto de Duplicatas", categoria "Juros sobre
// Empréstimos") — lidos de movimentos_cc, mesma definição da DRE/ /antecipacoes.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { parseConta } from '@/lib/ajustes/conta'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CAT_DESCONTO = '2.05.03' // Pagamento de Empréstimos (grupo Despesas Financeiras / Bancos)

// Decodifica as entidades HTML que a Omie devolve nos nomes (&amp; &quot; &#39; ...).
function decodeHtml(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
}

function anoAtual(): string {
  // Sem Date fixo: usa o relógio do servidor só para o default de janela.
  return new Date().toISOString().slice(0, 4)
}

export async function GET(request: NextRequest) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase não configurado' }, { status: 500 })
  try {
    const sp = request.nextUrl.searchParams
    const conta = parseConta(sp.get('conta')) // 'NOVA' | 'CASTRO' | undefined (Todas)
    const de = sp.get('de') || `${anoAtual()}-01-01`
    const ate = sp.get('ate') || new Date().toISOString().slice(0, 10)

    // ---- 1. Títulos a pagar da categoria (por data de emissão), paginado ----
    const PAGE = 1000
    const linhas: any[] = []
    for (let off = 0; off < 60000; off += PAGE) {
      let q = supabase.from('contas_pagar')
        .select([
          'codigo_lancamento', 'conta_omie', 'nome_fornecedor', 'valor_documento',
          'data_emissao', 'data_vencimento', 'data_previsao', 'status_titulo',
          'numero_documento_fiscal', 'numero_parcela',
          'chave_nfe:raw->>chave_nfe',
          'tipo_doc:raw->>codigo_tipo_documento',
          'id_origem:raw->>id_origem',
        ].join(','))
        .eq('codigo_categoria', CAT_DESCONTO)
        .gte('data_emissao', de).lte('data_emissao', ate)
        .order('codigo_lancamento', { ascending: true }) // ordem estável p/ paginação
        .range(off, off + PAGE - 1)
      if (conta) q = q.eq('conta_omie', conta)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      linhas.push(...(data || []))
      if (!data || data.length < PAGE) break
    }

    const titulos = linhas
      .filter((r) => !String(r.status_titulo || '').toUpperCase().includes('CANCEL'))
      .map((r) => {
        const desconto = r.id_origem === 'APIP' // integração "Omie Desconto de Duplicatas"
        return {
          codigo_lancamento: r.codigo_lancamento,
          conta_omie: r.conta_omie,
          fornecedor: decodeHtml(r.nome_fornecedor) || '(sem fornecedor)',
          valor: Number(r.valor_documento) || 0,
          data_emissao: r.data_emissao,
          data_vencimento: r.data_vencimento,
          data_previsao: r.data_previsao,
          status_titulo: r.status_titulo,
          numero_nf: r.numero_documento_fiscal || null,
          chave_nfe: r.chave_nfe || null,
          tipo_doc: r.tipo_doc || null, // NFE / NFS / 99999 / ...
          numero_parcela: r.numero_parcela || null,
          grupo: desconto ? 'desconto' : 'outros',
        }
      })
      .sort((a, b) => (a.data_emissao < b.data_emissao ? 1 : a.data_emissao > b.data_emissao ? -1 : 0))

    // ---- 2. Totais por grupo + por parceiro ----
    const totais = { desconto: { n: 0, valor: 0 }, outros: { n: 0, valor: 0 } }
    const parceiros = new Map<string, { nome: string; grupo: string; n: number; valor: number }>()
    titulos.forEach((t) => {
      const g = t.grupo as 'desconto' | 'outros'
      totais[g].n++
      totais[g].valor += t.valor
      const key = `${g}|${t.fornecedor}`
      const p = parceiros.get(key) || { nome: t.fornecedor, grupo: g, n: 0, valor: 0 }
      p.n++; p.valor += t.valor
      parceiros.set(key, p)
    })
    const porParceiro = Array.from(parceiros.values()).sort((a, b) => b.valor - a.valor)

    // ---- 3. Juros de antecipação (contraste) — movimentos_cc, mesma def. da DRE ----
    // CC virtual "Omie Desconto de Duplicatas", natureza P, exceto transferências
    // (transferência = líquido liberado; o resto = juro). Janela por data_pagamento.
    let juros = { valor: 0, indisponivel: false }
    try {
      const movs: any[] = []
      for (let off = 0; off < 60000; off += PAGE) {
        let q = supabase.from('movimentos_cc')
          .select('valor_pago,descricao_categoria')
          .ilike('nome_conta_corrente', '%Desconto de Duplicata%')
          .eq('natureza', 'P')
          .gte('data_pagamento', de).lte('data_pagamento', ate)
          .order('id', { ascending: true })
          .range(off, off + PAGE - 1)
        if (conta) q = q.eq('conta_omie', conta)
        const { data, error } = await q
        if (error) throw new Error(error.message)
        movs.push(...(data || []))
        if (!data || data.length < PAGE) break
      }
      movs.forEach((m) => {
        if (/transfer/i.test(m.descricao_categoria || '')) return
        juros.valor += Number(m.valor_pago) || 0
      })
    } catch (e: any) {
      console.error('antecipacoes juros:', e.message)
      juros = { valor: 0, indisponivel: true }
    }

    return NextResponse.json({
      conta: conta || 'todas', de, ate,
      titulos,
      totais: { ...totais, juros },
      porParceiro,
    })
  } catch (e: any) {
    console.error('ajustes/antecipacoes:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
