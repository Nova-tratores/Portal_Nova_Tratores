import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { getBackfillModeloStatus } from '@/lib/estoque/cmc-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Status do backfill-modelo. Portado de GET /api/backfill-modelo-status
// (server.js:2027).
export async function GET(req: NextRequest) {
  const conta = parseConta(req.nextUrl.searchParams.get('conta'));
  return NextResponse.json(getBackfillModeloStatus(conta));
}
