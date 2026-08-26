import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { clientesPorProduto } from '@/lib/estoque/inteligencia-comercial';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Histórico de clientes que compraram um produto (+ último contato do CRM).
// GET ?produto=<codigo_produto>&conta=
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const produto = req.nextUrl.searchParams.get('produto');
  if (!produto) return NextResponse.json({ erro: 'informe o produto' }, { status: 400 });
  try {
    return NextResponse.json(await clientesPorProduto(produto, conta));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
