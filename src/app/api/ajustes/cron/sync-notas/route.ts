import { NextRequest, NextResponse } from 'next/server';
import { cronSyncNotasSaida } from '@/lib/ajustes/cron';
import { comCronRun } from '@/lib/cron/observar';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || '';
function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  return !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const r = await comCronRun('ajustes-sync-notas', () => cronSyncNotasSaida(), { lockMinutos: 25 });
  if (r.erro) return NextResponse.json({ sucesso: false, erro: r.erro }, { status: 500 });
  return NextResponse.json({ sucesso: true, pulado: r.pulado, resultado: r.resultado, timestamp: new Date().toISOString() });
}

export const POST = GET;
