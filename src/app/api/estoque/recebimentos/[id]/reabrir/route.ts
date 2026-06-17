import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { reabrirRecebimento } from '@/lib/estoque/recebimentos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Reabrir: ESCREVE NO OMIE (ReverterRecebimento). Conta derivada da linha.
// Portado de POST /api/recebimentos/:id/reabrir (server.js:7798).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
