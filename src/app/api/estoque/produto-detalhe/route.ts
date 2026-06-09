import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { consultarProduto, consultarEstoque, listarCaractProduto, getTipoProduto } from '@/lib/estoque/omie';
import {
  buscarVendasPeriodos,
  buscarVendasLista,
  buscarComprasLista,
  buscarHistoricoProduto,
} from '@/lib/estoque/produtos';
import type { ProdutoDetalheResult } from '@/lib/estoque/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const n = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

// Cadastro completo do produto + custos + histórico mensal.
// Portado de /api/produto-detalhe (server.js:4690).
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

    const caracteristicas = await listarCaractProduto(id, conta ?? undefined);
    const tipo = getTipoProduto(caracteristicas);

    const [vendas, vendasLista, compras] = await Promise.all([
      buscarVendasPeriodos(id, conta),
      buscarVendasLista(id, conta, 30),
      buscarComprasLista(id, conta, 20),
    ]);

    // CMC usa sempre uma conta concreta (default NOVA em modo "Todas"), como no monolito.
    const historicoProduto = await buscarHistoricoProduto(id, 12, conta ?? CONTA_DEFAULT);

    const precoVenda = n(produto.valor_unitario);
    const cmcAtual = n(est.cmc);
    const precoCompra = compras.length > 0 ? n(compras[0].vu) : 0;
    const margemBruta = precoVenda > 0 ? ((precoVenda - cmcAtual) / precoVenda) * 100 : 0;

    const result: ProdutoDetalheResult = {
      produto: {
        codigo: produto.codigo,
        descricao: produto.descricao,
        familia: produto.descricao_familia || '',
        marca: produto.marca || '',
        ncm: produto.ncm || '',
        ean: produto.ean || '',
        unidade: produto.unidade || '',
        tipo_item: produto.tipoItem || '',
        peso_bruto: produto.peso_bruto || 0,
        peso_liq: produto.peso_liq || 0,
        altura: produto.altura || 0,
        largura: produto.largura || 0,
        profundidade: produto.profundidade || 0,
        valor_unitario: precoVenda,
        codigo_produto: id,
        observacoes: produto.obs_internas || '',
        tipo: tipo || '',
        caracteristicas: (caracteristicas || []).map((c) => ({ nome: c.cNomeCaract, conteudo: c.cConteudo })),
      },
      estoque: {
        cmc: cmcAtual,
        saldo: n(est.saldo),
        fisico: n(est.fisico),
        pendente: n(est.pendente),
        reservado: n(est.reservado),
        est_min: n(est.estoque_minimo),
      },
      custos: {
        preco_compra: precoCompra,
        preco_custo_medio: cmcAtual,
        preco_venda: precoVenda,
        margem_bruta_pct: margemBruta,
        margem_bruta_rs: precoVenda - cmcAtual,
        ultima_compra_data: compras.length > 0 ? compras[0].data : '',
        ultima_venda_data: vendasLista.length > 0 ? vendasLista[0].data : '',
        ultima_venda_valor: vendasLista.length > 0 ? vendasLista[0].vu : 0,
      },
      vendas,
      vendasLista,
      compras,
      historicoProduto,
    };
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
