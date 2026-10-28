import { NextRequest, NextResponse } from 'next/server';
import { cronBackfillCmc } from '@/lib/estoque/cron';
import { comCronRun } from '@/lib/cron/observar';
import { agendadorJaRodou } from '@/lib/agendador/reserva';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Backfill diário de CMC (todas as contas). Disparado por cron com Bearer CRON_SECRET.
// Substitui agendarBackfillCMCDiario do monolito (0 6 * * * UTC = 03:00 BRT).
//
// FIRE-AND-FORGET: o backfill percorre muitos produtos (rate limit da Omie) e passa
// dos ~5 min; o proxy do Railway corta requests HTTP longas -> 502 (falha no cron do
// GitHub Actions). Iniciamos em background e respondemos 200 já; a promise vive até
// o fim no servidor node persistente. O resultado vai para os logs.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // RESERVA (28/10/2026): o agendador do portal roda este backfill às 21:30 (tarefa
  // estoque-backfill-cmc, no worker). O GitHub só roda se o portal não tiver rodado bem.
  const feito = await agendadorJaRodou('estoque-backfill-cmc');
  if (feito) return NextResponse.json({ sucesso: true, pulado: `o agendador do portal já rodou (${feito})` });
  comCronRun('estoque-backfill-cmc', () => cronBackfillCmc(), { lockMinutos: 120, disparadoPor: 'github' })
    .then((r) => console.log('[cron backfill-cmc]', r.pulado ? 'pulado (já rodando)' : r.erro ? 'erro: ' + r.erro : 'concluído', JSON.stringify(r.resultado ?? {})))
    .catch((e) => console.error('[cron backfill-cmc] erro', (e as Error).message));
  return NextResponse.json({ sucesso: true, iniciado: true, timestamp: new Date().toISOString() });
}
