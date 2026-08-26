// =============================================================================
// API: composicao/produtos - 2º nível de drill do popup do Treemap (/fluxo).
// Dado UM terceiro (fornecedor) de uma categoria, devolve as MÁQUINAS/PRODUTOS
// (descrição, quantidade, valor) que compõem aquele valor.
//
// Passo A: acha os TÍTULOS do terceiro naquela categoria — MESMA lógica de filtro
//   de /api/dre-financeiro/composicao/detalhe (mesmo período por data_vencimento,
//   mesmo tratamento de grupo/categoria/terceiro e o corte de valor <= 0), pra a
//   soma bater com a barra do Treemap.
// Passo B: liga cada título à NF-e de entrada (recebimentos_nfe) por numero_nfe +
//   conta e agrega os itens (colunas `maquinas` + `produtos`, via itensReceb).
//
// Só há detalhamento de itens para CONTAS A PAGAR (compras têm NF-e de entrada).
// Contas a receber: sem fonte confiável de itens -> { semDetalhe: true, itens: [] }.
//
// Ressalva: a soma dos itens da NF-e pode NÃO bater exatamente com o valor do
// título (frete/impostos/rateio de duplicata) — por isso devolvemos totalTitulo
// (dos títulos) e totalItens (das NF-e) separados.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import {
  CONTA_PADRAO, tabelaPorTipo, colunaNomePorTipo, aplicarConta,
  ehDescontoDuplicataAPIP, GRUPO_COMPOSICAO_ANTECIP,
} from '@/lib/dre-financeiro/calc'
import { itensReceb } from '@/lib/estoque/recebimentos'

export const dynamic = 'force-dynamic'

// Sentinelas iguais às da rota /composicao (grupo/categoria/terceiro nulo).
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

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function toArr(v: unknown): any[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

// Extrai {descricao, qtd, valor} de um item de recebimento. O JSON pode vir no
// formato aninhado do Omie (it.prod.*) ou num formato plano legado.
function parseItem(it: any): { descricao: string; qtd: number; valor: number } {
  const prod = it && it.prod
  if (prod) {
    return {
      descricao: String(prod.xProd ?? prod.cDescricao ?? '').trim(),
      qtd: num(prod.qCom ?? prod.nQtde),
      valor: num(prod.vProd ?? prod.vTotItem),
    }
  }
  return {
    descricao: String(it?.cDescricao ?? it?.descricao ?? it?.xProd ?? '').trim(),
    qtd: num(it?.nQtde ?? it?.quantidade ?? it?.qCom),
    valor: num(it?.vProd ?? it?.nValorTotal ?? it?.valor_total ?? (num(it?.nValUnit) * num(it?.nQtde))),
  }
}

// Chunk simples para não estourar o limite de itens do filtro .in().
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
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

    // ---- Passo A: títulos do terceiro na categoria (espelha composicao/detalhe)
    function base(sel: string, head = false) {
      let q = head
        ? db.from(tabela).select(sel, { count: 'exact', head: true })
        : db.from(tabela).select(sel)
      q = q.gte('data_vencimento', de).lte('data_vencimento', ate)
      q = aplicarConta(q, conta)
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
    const sel = `codigo_lancamento,numero_documento_fiscal,conta_omie,data_vencimento,valor_documento,descricao_categoria,codigo_categoria,id_origem:raw->>id_origem`
    const reqs: Promise<any>[] = []
    for (let p = 0; p < paginas; p++) {
      const from = p * PAG
      reqs.push(base(sel).order('codigo_lancamento').range(from, from + PAG - 1) as any)
    }
    const lotes = await Promise.all(reqs)
    const linhas: any[] = []
    for (const { data, error } of lotes) {
      if (error) throw new Error(error.message)
      if (data) linhas.push(...data)
    }

    const ehBucketAntecip = grupo === GRUPO_COMPOSICAO_ANTECIP
    const titulos = linhas.filter((r) => {
      if ((Number(r.valor_documento) || 0) <= 0) return false
      const cat = r.descricao_categoria || (r.codigo_categoria || SEM_CAT)
      if (cat !== categoria) return false
      if (ehBucketAntecip) return ehDescontoDuplicataAPIP(r)
      if (grupo === 'Despesas Financeiras / Bancos' && ehDescontoDuplicataAPIP(r)) return false
      return true
    })

    const totalTitulo = titulos.reduce((s, t) => s + (Number(t.valor_documento) || 0), 0)

    // Contas a receber não têm fonte de itens confiável.
    if (tipo !== 'pagar') {
      return NextResponse.json({ terceiro, categoria, tipo, totalTitulo, totalItens: 0, itens: [], semDetalhe: true })
    }

    // ---- Passo B: NF-e de entrada -> itens (maquinas + produtos) agregados
    // Conjunto de chaves permitidas "<nf normalizada>|<conta>" a partir dos títulos.
    const chavesOk = new Set<string>()
    const nfVariants = new Set<string>()
    for (const t of titulos) {
      const nfRaw = t.numero_documento_fiscal != null ? String(t.numero_documento_fiscal) : ''
      if (!nfRaw) continue
      const nfNum = nfRaw.replace(/^0+/, '')
      const contaLc = String(t.conta_omie || '').toLowerCase()
      nfVariants.add(nfRaw)
      if (nfNum && nfNum !== nfRaw) nfVariants.add(nfNum)
      chavesOk.add(nfRaw + '|' + contaLc)
      if (nfNum) chavesOk.add(nfNum + '|' + contaLc)
    }

    const agg = new Map<string, { descricao: string; qtd: number; valor: number }>()
    const nfVistas = new Set<string>() // dedup por (nf, conta): itens 1x por NF

    if (nfVariants.size > 0) {
      const variantes = Array.from(nfVariants)
      for (const bloco of chunk(variantes, 200)) {
        let rq = db.from('recebimentos_nfe').select('numero_nfe,conta_omie,maquinas,produtos').in('numero_nfe', bloco)
        if (conta !== 'todas') rq = rq.eq('conta_omie', conta)
        const { data: recs, error: eRec } = await rq
        if (eRec) throw new Error(eRec.message)
        for (const rec of (recs || [])) {
          const nf = rec.numero_nfe != null ? String(rec.numero_nfe) : ''
          const contaLc = String(rec.conta_omie || '').toLowerCase()
          const nfNum = nf.replace(/^0+/, '')
          // Só entra se a NF corresponde a um título deste terceiro/conta.
          if (!chavesOk.has(nf + '|' + contaLc) && !chavesOk.has(nfNum + '|' + contaLc)) continue
          const dedupKey = nfNum + '|' + contaLc
          if (nfVistas.has(dedupKey)) continue
          nfVistas.add(dedupKey)

          const itens = itensReceb({ maquinas: toArr(rec.maquinas), produtos: toArr(rec.produtos) } as any)
          for (const it of itens) {
            const { descricao, qtd, valor } = parseItem(it)
            if (!descricao) continue
            const k = descricao.toUpperCase()
            const cur = agg.get(k) || { descricao, qtd: 0, valor: 0 }
            cur.qtd += qtd
            cur.valor += valor
            agg.set(k, cur)
          }
        }
      }
    }

    const itens = Array.from(agg.values()).sort((a, b) => b.valor - a.valor)
    const totalItens = itens.reduce((s, i) => s + i.valor, 0)

    return NextResponse.json({ terceiro, categoria, tipo, totalTitulo, totalItens, itens })
  } catch (e: any) {
    console.error('composicao/produtos:', e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
