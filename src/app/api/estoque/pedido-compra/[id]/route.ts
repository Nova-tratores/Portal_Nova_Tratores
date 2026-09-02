import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Detalhe de um pedido de compra (itens com SKU/descrição) — usado pelo modal
// de recebimento manual.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirPermissao(req, 'estoque', 'sugestao-compra');
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: (e as { status?: number }).status ?? 401 });
  }
  const { id } = await params;
  try {
    const { data: ped } = await supabase.from('pedido_compra').select('*').eq('id', Number(id)).maybeSingle();
    if (!ped) return NextResponse.json({ erro: 'pedido não encontrado' }, { status: 404 });
    const { data: itens } = await supabase.from('pedido_compra_item')
      .select('id, codigo_produto, qtd_sugerida, qtd_pedida, qtd_recebida, preco_estimado, status_linha').eq('pedido_id', Number(id));

    const cps = (itens ?? []).map((i) => i.codigo_produto);
    const { data: prods } = cps.length
      ? await supabase.from('produtos').select('codigo_produto, codigo, descricao').eq('conta_omie', ped.conta_omie).in('codigo_produto', cps)
      : { data: [] };
    const info = new Map((prods ?? []).map((p) => [Number(p.codigo_produto), { sku: p.codigo, descricao: p.descricao }]));

    const lista = (itens ?? []).map((i) => ({
      ...i,
      sku: info.get(Number(i.codigo_produto))?.sku ?? String(i.codigo_produto),
      descricao: info.get(Number(i.codigo_produto))?.descricao ?? '',
    }));
    return NextResponse.json({ pedido: ped, itens: lista });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
