import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { consultarProduto, consultarEstoque } from '@/lib/estoque/omie';
import { buscarVendasPeriodos, buscarVendasLista, buscarComprasLista } from '@/lib/estoque/produtos';
import type { BuscarResult } from '@/lib/estoque/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Busca rápida de produto: cadastro Omie + estoque + cards de venda + listas.
// Portado de /api/buscar (server.js:4473).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const codigo = req.nextUrl.searchParams.get('codigo');
  if (!codigo) return NextResponse.json({ erro: 'Informe o codigo do produto' });

  try {
    const produto = await consultarProduto(codigo, conta ?? undefined);
    if (!produto || produto.faultstring) {
      return NextResponse.json({ erro: 'Produto nao encontrado: ' + (produto?.faultstring || '') });
    }
    const id = produto.codigo_produto;

    let est: Awaited<ReturnType<typeof consultarEstoque>> = {};
    try {
      est = await consultarEstoque(id, conta ?? undefined);
    } catch {
      est = {};
    }

    const [vendas, vendasLista, compras] = await Promise.all([
      buscarVendasPeriodos(id, conta),
      buscarVendasLista(id, conta, 15),
      buscarComprasLista(id, conta, 10),
    ]);

    const result: BuscarResult = {
      produto: {
        codigo: produto.codigo,
        descricao: produto.descricao,
        familia: produto.descricao_familia || 'N/D',
        marca: produto.marca || 'N/D',
        valor_venda: produto.valor_unitario || 0,
        codigo_produto: id,
      },
      estoque: {
        cmc: est.cmc ?? 'N/D',
        saldo: est.saldo ?? 'N/D',
        fisico: est.fisico ?? 'N/D',
        pendente: est.pendente ?? 'N/D',
        reservado: est.reservado ?? 'N/D',
        est_min: est.estoque_minimo ?? 'N/D',
      },
      vendas,
      vendasLista,
      compras,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
