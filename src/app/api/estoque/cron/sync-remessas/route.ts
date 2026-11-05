import { NextRequest, NextResponse } from 'next/server';
import { cronSyncRemessas } from '@/lib/estoque/cron';
import { agendadorJaRodou } from '@/lib/agendador/reserva';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Sync das fontes da tela Remessas do Visual Estoque (remessas, movimentação por
// produto e outras entradas) por conta. Disparado por cron com Bearer CRON_SECRET.
//
// FIRE-AND-FORGET: são 4 syncs Omie por conta e o job passa de 5 min, mas o proxy
// do Railway corta requests HTTP longas (~5 min -> 502). Iniciamos em background e
// respondemos 200 já. O portal é servidor node persistente, então a promise vive
// até o fim. O resultado vai para os logs.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // RESERVA (05/11/2026): o agendador do portal roda este sync no worker (tarefa estoque-sync-remessas).
  // O GitHub só roda se o portal não tiver rodado bem nas últimas 12 h.
  const feito = await agendadorJaRodou('estoque-sync-remessas', 12);
  if (feito) return NextResponse.json({ ok: true, pulado: `o agendador do portal já rodou (${feito})` });
  cronSyncRemessas()
    .then((r) => console.log('[cron sync-remessas] concluído', JSON.stringify(r)))
    .catch((e) => console.error('[cron sync-remessas] erro', (e as Error).message));
  return NextResponse.json({ sucesso: true, iniciado: true, timestamp: new Date().toISOString() });
}
