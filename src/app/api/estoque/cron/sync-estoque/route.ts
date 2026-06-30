import { NextRequest, NextResponse } from 'next/server';
import { cronSyncEstoque } from '@/lib/estoque/cron';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Sync RÁPIDO: atualiza estoque/cmc/valor_estoque das linhas já existentes em
// `produtos`, mantendo o saldo do pátio fresco entre os syncs completos.
// Disparado por cron com Bearer CRON_SECRET (a cada poucas horas).
//
// FIRE-AND-FORGET: o sync leva ~12 min (delay de rate limit da Omie por chamada)
// e o proxy do Railway corta requests HTTP longas (~5 min -> 502). Por isso
// iniciamos o trabalho em background e respondemos 200 imediatamente. O portal
// roda como servidor node persistente, então a promise continua viva até o fim
// (mesmo padrão do app externo que isto substitui). O resultado vai para os logs.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  cronSyncEstoque()
    .then((r) => console.log('[cron sync-estoque] concluído', JSON.stringify(r)))
    .catch((e) => console.error('[cron sync-estoque] erro', (e as Error).message));
  return NextResponse.json({ sucesso: true, iniciado: true, timestamp: new Date().toISOString() });
}
