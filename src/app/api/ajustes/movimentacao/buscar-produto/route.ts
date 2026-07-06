import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { buscarProdutosAutocomplete } from '@/lib/ajustes/movimentacao';

export const dynamic = 'force-dynamic';

// Autocomplete de produto (código OU descrição) na tabela produtos do Supabase.
// Query: conta, termo (mín. 2 chars).
export async function GET(req: NextRequest) {
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
