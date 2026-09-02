import { NextRequest, NextResponse } from 'next/server';
import { cronSyncIncremental } from '@/lib/estoque/cron';
import { comCronRun } from '@/lib/cron/observar';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Sync incremental do mês atual (vendas + OS) por conta. Disparado por cron com
// Bearer CRON_SECRET. Mantém o dashboard quente sem depender da UI.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const r = await comCronRun('estoque-sync-incremental', () => cronSyncIncremental(), { lockMinutos: 25 });
  if (r.erro) return NextResponse.json({ sucesso: false, erro: r.erro }, { status: 500 });
  return NextResponse.json({ sucesso: true, pulado: r.pulado, resultados: r.resultado, timestamp: new Date().toISOString() });
}
