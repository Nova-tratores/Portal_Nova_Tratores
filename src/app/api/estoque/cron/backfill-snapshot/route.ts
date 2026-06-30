import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { cronBackfillSnapshots } from '@/lib/estoque/cron';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min (mas o job roda em background)

// Backfill do histórico de estoque por família, consultando a posição na Omie
// no fim de cada mês desde ?desde=YYYY-MM (default 2023-01) até hoje.
// ?conta=NOVA|CASTRO opcional (default: todas). Bearer CRON_SECRET.
//
// FIRE-AND-FORGET: job longo (~15-20 min/conta). Inicia em background e
// responde 200 na hora; progresso vai para os logs / status em memória.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const desdeRaw = sp.get('desde') || '2023-01';
  const [ay, am] = desdeRaw.split('-').map((x) => parseInt(x));
  const ano = ay && ay >= 2000 ? ay : 2023;
  const mes = am && am >= 1 && am <= 12 ? am : 1;
  const conta = parseConta(sp.get('conta')) || undefined;

  cronBackfillSnapshots({ ano, mes }, conta)
    .then((r) => console.log('[cron backfill-snapshot] concluído', JSON.stringify(r)))
    .catch((e) => console.error('[cron backfill-snapshot] erro', (e as Error).message));

  return NextResponse.json({ sucesso: true, iniciado: true, desde: { ano, mes }, conta: conta || 'todas', timestamp: new Date().toISOString() });
}
