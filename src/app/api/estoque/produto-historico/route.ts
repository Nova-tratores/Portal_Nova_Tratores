import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { consultarProduto } from '@/lib/estoque/omie';
import { buscarHistoricoProduto } from '@/lib/estoque/produtos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Histórico CMC + venda + margem com período variável (12/24/36/48 meses).
// Portado de /api/produto-historico (server.js:4825).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const codigo = req.nextUrl.searchParams.get('codigo');
  const periodo = parseInt(req.nextUrl.searchParams.get('periodo') || '12', 10) || 12;
  if (!codigo) return NextResponse.json({ erro: 'Informe o codigo do produto' });
  if (![12, 24, 36, 48].includes(periodo)) {
    return NextResponse.json({ erro: 'Periodo deve ser 12, 24, 36 ou 48' });
  }

  try {
    const produto = await consultarProduto(codigo, conta ?? undefined);
    if (!produto || produto.faultstring) return NextResponse.json({ erro: 'Produto nao encontrado' });
    const historico = await buscarHistoricoProduto(produto.codigo_produto, periodo, conta ?? CONTA_DEFAULT);
    return NextResponse.json({ codigo, id_produto: produto.codigo_produto, periodo, historico });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
