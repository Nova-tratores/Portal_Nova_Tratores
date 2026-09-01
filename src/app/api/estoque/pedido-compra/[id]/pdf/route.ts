import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/estoque/supabase';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { gerarPDFPedidoCompra, type ItemPedidoPDF } from '@/lib/estoque/sugestao-compra/pdf-pedido';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// PDF (paisagem) de um pedido de compra. Buffer via pdfkit.
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
      .select('codigo_produto, qtd_pedida, preco_estimado').eq('pedido_id', Number(id));

    const cps = (itens ?? []).map((i) => i.codigo_produto);
    const { data: prods } = cps.length
      ? await supabase.from('produtos').select('codigo_produto, codigo, descricao').eq('conta_omie', ped.conta_omie).in('codigo_produto', cps)
      : { data: [] };
    const info = new Map((prods ?? []).map((p) => [Number(p.codigo_produto), { sku: p.codigo, descricao: p.descricao }]));

    let fornecedor: string | undefined;
    if (ped.codigo_fornecedor != null) {
      const { data: f } = await supabase.from('Fornecedores').select('nome').eq('id', ped.codigo_fornecedor).maybeSingle();
      fornecedor = f?.nome;
    }
    let criadoPor: string | undefined;
    if (ped.criado_por) {
      const { data: u } = await supabase.from('financeiro_usu').select('nome').eq('id', ped.criado_por).maybeSingle();
      criadoPor = u?.nome;
    }

    const itensPDF: ItemPedidoPDF[] = (itens ?? []).map((i) => ({
      sku: info.get(Number(i.codigo_produto))?.sku ?? String(i.codigo_produto),
      descricao: info.get(Number(i.codigo_produto))?.descricao ?? '',
      qtd_pedida: Number(i.qtd_pedida) || 0,
      preco_estimado: Number(i.preco_estimado) || 0,
    }));

    const buf = await gerarPDFPedidoCompra({
      numero: ped.id, conta: ped.conta_omie, fornecedor,
      data: ped.data_pedido ? new Date(ped.data_pedido).toLocaleDateString('pt-BR') : undefined,
      criadoPor, observacao: ped.observacao || undefined, itens: itensPDF,
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="pedido-compra-${ped.id}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
