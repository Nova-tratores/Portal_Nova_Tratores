// GET /api/empresa/pedido-itens?conta=NOVA&pedido=7885 — as peças de um pedido de venda (vendas_itens), para abrir um
// pedido na tela Peças do /empresa (José, 12/11). Só lê a tabela: rápido.
import { NextRequest, NextResponse } from 'next/server'
import { guardarDre } from '@/lib/dre-financeiro/rota'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardarDre(req)
  if (g.resposta) return g.resposta
  const conta = (req.nextUrl.searchParams.get('conta') || 'NOVA').toUpperCase() === 'CASTRO' ? 'CASTRO' : 'NOVA'
  const pedido = String(req.nextUrl.searchParams.get('pedido') || '').trim()
  if (!pedido) return NextResponse.json({ itens: [] })
  const { data, error } = await supabaseAdmin.from('vendas_itens').select('codigo_produto,descricao,quantidade,valor_unitario,valor_total,cmc_unitario,valor_desconto,familia')
    .eq('conta_omie', conta).eq('numero_pedido', pedido).order('valor_total', { ascending: false })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  const itens = (data || []).map((i) => ({
    codigo: String(i.codigo_produto || ''), descricao: String(i.descricao || '').trim(), familia: String(i.familia || ''), qtd: Number(i.quantidade) || 0,
    unitario: Number(i.valor_unitario) || 0, total: Number(i.valor_total) || 0, custo: (Number(i.cmc_unitario) || 0) * (Number(i.quantidade) || 0), desconto: Number(i.valor_desconto) || 0,
  }))
  return NextResponse.json({ itens }, { headers: { 'Cache-Control': 'private, max-age=300' } })
}
