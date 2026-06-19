import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { lerStatusNegativos } from '@/lib/ajustes/negativos';

export const dynamic = 'force-dynamic';

// Status/resultado da varredura de estoque negativo (lê do job no Supabase + cache).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  try {
    return NextResponse.json(await lerStatusNegativos(conta, force));
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
