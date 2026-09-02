import { NextRequest, NextResponse } from 'next/server';
import { cronSyncCompras } from '@/lib/estoque/cron';
import { comCronRun } from '@/lib/cron/observar';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min (mas roda em background)

// Sync INCREMENTAL de compras/notas de entrada dos últimos ?meses (default 3),
// por conta (NOVA + CASTRO). Mantém notas_entrada fresca sem rebuild total.
// Disparado por cron com Bearer CRON_SECRET.
//
// FIRE-AND-FORGET: cada conta re-busca a janela na Omie (paginado, com sleep);
// inicia em background e responde 200 na hora. Resultado vai para os logs.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const meses = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get('meses') || '3') || 3));

  comCronRun('estoque-sync-compras', () => cronSyncCompras(meses), { lockMinutos: 30 })
    .then((r) => console.log('[cron sync-compras]', r.pulado ? 'pulado (já rodando)' : r.erro ? 'erro: ' + r.erro : 'concluído', JSON.stringify(r.resultado ?? {})))
    .catch((e) => console.error('[cron sync-compras] erro', (e as Error).message));

  return NextResponse.json({ sucesso: true, iniciado: true, meses, timestamp: new Date().toISOString() });
}
