import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { analisarComCache } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Análise de CMC distorcido por NF de garantia (consulta ao vivo no Omie + cache).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  try {
    const payload = await analisarComCache(conta, sp.get('de'), sp.get('ate'), force);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
