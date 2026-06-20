import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/ajustes/conta';
import { listarAlertas, lerStatusVerificacao } from '@/lib/ajustes/verificacao';

export const dynamic = 'force-dynamic';

// Lista de alertas (cmc_alertas) + contagem nao lidos + estado da verificacao.
// ?conta=NOVA|CASTRO (default Todas) &lido=0|1 &tipo=...
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const lidoRaw = sp.get('lido');
  const lido = lidoRaw === '0' || lidoRaw === 'false' ? false : lidoRaw === '1' || lidoRaw === 'true' ? true : undefined;
  const tipo = sp.get('tipo') || undefined;
  try {
    const { alertas, naoLidos } = await listarAlertas({ conta, lido, tipo });
    const verificacao = await lerStatusVerificacao();
    return NextResponse.json({ alertas, naoLidos, verificacao });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
