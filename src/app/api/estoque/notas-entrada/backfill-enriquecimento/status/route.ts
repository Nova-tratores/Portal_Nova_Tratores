import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { getBackfillStatus } from '@/lib/estoque/notas-entrada';
import { protegerRota } from '@/lib/ajustes/permissao-server';

export const dynamic = 'force-dynamic';

// Status do backfill. Portado de /api/notas-entrada/backfill-enriquecimento/status.
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'notas-entrada' }]);
  if (g.resposta) return g.resposta;
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  return NextResponse.json(getBackfillStatus(conta));
}
