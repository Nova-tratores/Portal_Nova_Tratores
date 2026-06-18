import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { consultarProdutoPorId } from '@/lib/estoque/recebimentos';
import { consultarEstoque } from '@/lib/estoque/omie';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Detalhe de produto por ID interno Omie (popup de item do recebimento).
// Os itens trazem nCodProduto (id interno), não o SKU — então buscamos por id.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const id = parseInt(sp.get('id') || '', 10);
  if (!id) return NextResponse.json({ erro: 'id do produto obrigatorio' });
  try {
    const produto = await consultarProdutoPorId(id, conta);
    let estoque: Awaited<ReturnType<typeof consultarEstoque>> = {};
    try {
      estoque = await consultarEstoque(produto.codigo_produto, conta ?? undefined);
    } catch {
      estoque = {};
    }
    return NextResponse.json({
      produto,
      estoque: {
        cmc: estoque.cmc ?? 'N/D',
        saldo: estoque.saldo ?? 'N/D',
        fisico: estoque.fisico ?? 'N/D',
        reservado: estoque.reservado ?? 'N/D',
      },
    });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message });
  }
}
