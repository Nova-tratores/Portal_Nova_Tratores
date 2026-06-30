import { NextRequest, NextResponse } from 'next/server';
import { getBackfillSnapshotStatus } from '@/lib/estoque/cruzamento-familia';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';

// Status (em memória) do backfill de snapshot histórico. Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getBackfillSnapshotStatus());
}
