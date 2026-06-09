import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { consultarProduto } from '@/lib/estoque/omie';
import { buscarCmcHistorico } from '@/lib/estoque/produtos';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Histórico de CMC dos últimos 13 meses (cache + Omie nos meses faltantes).
// Portado de /api/cmc-historico (server.js:4844).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const codigo = req.nextUrl.searchParams.get('codigo');
  if (!codigo) return NextResponse.json({ erro: 'Informe o codigo do produto' });

  try {
    const produto = await consultarProduto(codigo, conta ?? undefined);
    if (!produto || produto.faultstring) return NextResponse.json({ erro: 'Produto nao encontrado' });
    const cmc = await buscarCmcHistorico(produto.codigo_produto, conta ?? CONTA_DEFAULT);
    return NextResponse.json({ produto: codigo, id_produto: produto.codigo_produto, cmc });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
