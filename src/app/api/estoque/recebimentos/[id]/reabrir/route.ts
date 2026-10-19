import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { reabrirRecebimento } from '@/lib/estoque/recebimentos';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Mesmo gate da tela /estoque/recebimentos-omie (pode('estoque','recebimentos-omie')).
const OPCOES = [{ modulo: 'estoque', acao: 'recebimentos-omie' }];
export const maxDuration = 60;

// Reabrir: ESCREVE NO OMIE (ReverterRecebimento). Conta derivada da linha.
// Portado de POST /api/recebimentos/:id/reabrir (server.js:7798).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, OPCOES);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  try {
    const { id } = await params;
    const r = await reabrirRecebimento(conta, parseInt(id, 10));
    if (r.naoEncontrado) return NextResponse.json({ erro: r.erro }, { status: 404 });
    if (r.erro) return NextResponse.json({ erro: r.erro });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
