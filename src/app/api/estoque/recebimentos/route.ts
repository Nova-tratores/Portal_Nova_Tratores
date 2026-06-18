import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { listarRecebimentos } from '@/lib/estoque/recebimentos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lista recebimentos (espelho de recebimentos_nfe). Portado de GET /api/recebimentos (server.js:7629).
// O usuário logado (p/ filtro 'me') vem do front via ?meu=<nome/email>.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  try {
    const r = await listarRecebimentos({
      conta,
      status: sp.get('status') || undefined,
      tipo: sp.get('tipo') || undefined,
      responsavel: sp.get('responsavel'),
      pagina: parseInt(sp.get('pagina') || '1', 10),
      meu: sp.get('meu') || '',
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
