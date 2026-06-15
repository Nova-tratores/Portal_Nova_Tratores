// =============================================================================
// API: produtos de um titulo (descricao, 1 por linha) - port FIEL de
// GET /api/titulos/:tipo/:codigo/produtos. Usado no modal /vencidos.
// So existe para CONTAS A PAGAR (compras): liga o titulo a recebimentos_nfe
// (NF-e de entrada) por numero da NF + empresa, e le o JSON `produtos`. Notas de
// frete/servico nao tem itens (retorna lista vazia). Contas a receber: sem fonte
// de itens confiavel no banco hoje -> retorna vazio.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

const TIPOS_TITULO = new Set(['pagar', 'receber'])

type Ctx = { params: Promise<{ tipo: string; codigo: string }> }

export async function GET(_request: NextRequest, context: Ctx) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  const { tipo: tipoRaw, codigo: codigoRaw } = await context.params
  const tipo = String(tipoRaw || '').toLowerCase()
  const codigo = Number(codigoRaw)
  if (!TIPOS_TITULO.has(tipo) || !Number.isFinite(codigo)) {
    return NextResponse.json({ erro: 'tipo ou codigo invalido' }, { status: 400 })
  }
  try {
    if (tipo !== 'pagar') return NextResponse.json({ produtos: [] })
    const { data: tit } = await supabase.from('contas_pagar')
      .select('numero_documento_fiscal,conta_omie')
      .eq('codigo_lancamento', codigo).single()
    if (!tit || !tit.numero_documento_fiscal) return NextResponse.json({ produtos: [] })

    const nfRaw = String(tit.numero_documento_fiscal)
    const nfNum = nfRaw.replace(/^0+/, '')
    const contaLc = String(tit.conta_omie || '').toLowerCase()
    const cond = nfNum && nfNum !== nfRaw
      ? `numero_nfe.eq.${nfRaw},numero_nfe.eq.${nfNum}`
      : `numero_nfe.eq.${nfRaw}`
    const { data: nf } = await supabase.from('recebimentos_nfe')
      .select('produtos').or(cond).eq('conta_omie', contaLc).limit(1)
    const rec = nf && nf[0]
    if (!rec || !rec.produtos) return NextResponse.json({ produtos: [] })

    let arr: any = []
    try { arr = typeof rec.produtos === 'string' ? JSON.parse(rec.produtos) : rec.produtos }
    catch (_) { arr = [] }
    const produtos = (Array.isArray(arr) ? arr : [])
      .map((p: any) => ({
        descricao: p.cDescricao || p.descricao || '',
        quantidade: p.nQtde != null ? (p.nQtde + (p.cUnidade ? ' ' + p.cUnidade : '')) : '',
      }))
      .filter((p: any) => p.descricao)
    return NextResponse.json({ produtos })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
