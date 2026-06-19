import { NextRequest, NextResponse } from 'next/server';
import { parseConta, CONTA_DEFAULT } from '@/lib/ajustes/conta';
import { listarAjusteCustosProdutos } from '@/lib/ajustes/cmc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lista produtos da conta (saldo + CMC) da tabela `produtos` sincronizada.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta')) ?? CONTA_DEFAULT;
  const force = sp.get('force') === '1' || sp.get('force') === 'true';
  try {
    const payload = await listarAjusteCustosProdutos(conta, force);
    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
