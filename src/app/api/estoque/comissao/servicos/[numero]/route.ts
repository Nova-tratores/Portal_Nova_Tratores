import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/estoque/conta';
import { detalheServico } from '@/lib/estoque/comissao';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/comissao (pode('estoque','comissao')).
const OPCOES = [{ modulo: 'estoque', acao: 'comissao' }];

export async function GET(req: NextRequest, { params }: { params: Promise<{ numero: string }> }) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    const { numero } = await params;
    const r = await detalheServico(conta, decodeURIComponent(numero));
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
