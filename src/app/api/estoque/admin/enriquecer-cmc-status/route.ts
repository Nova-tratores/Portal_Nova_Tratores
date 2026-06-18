import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { getEnriquecimentoStatus } from '@/lib/estoque/cmc-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Status do loop de enriquecer-cmc. Portado de
// GET /api/admin/enriquecer-cmc-status (server.js:1902).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  return NextResponse.json(getEnriquecimentoStatus(conta));
}
