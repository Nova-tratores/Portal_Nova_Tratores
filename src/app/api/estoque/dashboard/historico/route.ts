import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { montarHistorico, maxCardHistorico } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Histórico mês a mês de um card. Portado de /api/dashboard/historico (server.js:2938).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const card = parseInt(req.nextUrl.searchParams.get('card') || '');
  const filtroCategoria = req.nextUrl.searchParams.get('categoria') || null;
  const max = await maxCardHistorico();
  if (isNaN(card) || card < 0 || card > max) {
    return NextResponse.json({ erro: 'Informe card=0..' + max });
  }
  try {
    const r = await montarHistorico(card, filtroCategoria, conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
