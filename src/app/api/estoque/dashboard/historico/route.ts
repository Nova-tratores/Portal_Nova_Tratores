import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { montarHistorico } from '@/lib/estoque/dashboard-listas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Histórico mês a mês de um card (identificado por chave estável). Portado de
// /api/dashboard/historico (server.js:2938).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  const catKey = req.nextUrl.searchParams.get('catKey');
  const filtroCategoria = req.nextUrl.searchParams.get('categoria') || null;
  if (!catKey) {
    return NextResponse.json({ erro: 'Informe catKey' });
  }
  try {
    const r = await montarHistorico(catKey, filtroCategoria, conta);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
