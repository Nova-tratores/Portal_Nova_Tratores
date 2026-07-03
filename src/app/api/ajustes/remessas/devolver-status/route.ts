import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { lerStatusDevolucao } from '@/lib/ajustes/remessas';

export const dynamic = 'force-dynamic';

// Estado/resultado do lote de devolucao (polling do front). Query: conta.
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta')) ?? CONTA_DEFAULT;
  try {
    return NextResponse.json(await lerStatusDevolucao(conta));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
