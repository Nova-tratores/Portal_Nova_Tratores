import { NextRequest, NextResponse } from 'next/server';
import { protegerRota } from '@/lib/ajustes/permissao-server';
import { getCacheStatus } from '@/lib/estoque/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Status de sync per-conta. Portado de GET /api/cache-status (server.js:1546).
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'estoque', acao: 'admin' }]);
  if (g.resposta) return g.resposta;
  return NextResponse.json(getCacheStatus());
}
