import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { obterRemessasAbertas } from '@/lib/ajustes/remessas';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Lista remessas em aberto (nao canceladas/faturadas) com origem (OS) e quem
// criou. Cache 10min; a primeira busca pagina a Omie inteira (lenta). Query:
// conta=NOVA|CASTRO, force=1 (ignora cache).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  try {
    const out = await obterRemessasAbertas(conta, force);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ erro: (e as { faultstring?: string }).faultstring || (e as Error).message }, { status: 500 });
  }
}
