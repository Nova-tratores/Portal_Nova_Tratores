import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { resumoRecebimentos } from '@/lib/estoque/recebimentos';

export const dynamic = 'force-dynamic';

// Contadores por tipo/status (badges das abas). Portado de GET /api/recebimentos/resumo (server.js:7666).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  try {
    const resumo = await resumoRecebimentos(conta, sp.get('meu') || '');
    return NextResponse.json(resumo);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
