import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { homeResumo } from '@/lib/ajustes/home';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Resumo da semana anterior (recebimentos pendentes, pedidos abertos, estoque negativo).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  try {
    return NextResponse.json(await homeResumo(conta, force));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
