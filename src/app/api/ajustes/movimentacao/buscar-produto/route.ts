import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { buscarProdutosAutocomplete } from '@/lib/ajustes/movimentacao';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Autocomplete de produto (código OU descrição) na tabela produtos do Supabase.
// Query: conta, termo (mín. 2 chars). Telas: Movimentação de Produto e Recebimentos.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [
    { modulo: 'estoque', acao: 'movimentacao-produto' },
    { modulo: 'estoque', acao: 'recebimentos' },
    { modulo: 'ajustes', acao: 'recebimentos' },
  ]);
  if (g.resposta) return g.resposta;
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const termo = sp.get('termo') || '';
  try {
    const produtos = await buscarProdutosAutocomplete(conta, termo);
    return NextResponse.json({ produtos });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
