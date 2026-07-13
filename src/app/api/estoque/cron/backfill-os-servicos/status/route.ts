import { NextRequest, NextResponse } from 'next/server';
import { getBackfillOsServicosStatus } from '@/lib/estoque/os-backfill';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';

// Progresso do backfill de os_servicos_itens (por conta). Bearer CRON_SECRET.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(getBackfillOsServicosStatus());
}
