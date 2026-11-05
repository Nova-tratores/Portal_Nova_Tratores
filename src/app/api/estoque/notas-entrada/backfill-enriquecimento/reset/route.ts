import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { resetBackfillStatus } from '@/lib/estoque/notas-entrada';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Reseta o estado do backfill. Portado de POST .../backfill-enriquecimento/reset.
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'notas-entrada' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  resetBackfillStatus(conta);
  return NextResponse.json({ ok: true, conta: conta || 'TODAS' });
}
