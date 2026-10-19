import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { buscarProdutos } from '@/lib/ajustes/descricoes';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET ?conta=NOVA&q=... -> { produtos }  (busca por SKU/descrição no master)
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'ajustes', acao: 'descricoes' }]);
  if (g.resposta) return g.resposta;
  try {
    const sp = req.nextUrl.searchParams;
    const conta = parseConta(sp.get('conta')) || CONTA_DEFAULT;
    const q = sp.get('q') || '';
    const produtos = await buscarProdutos(conta, q);
    return NextResponse.json({ produtos });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
