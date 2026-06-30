import { NextRequest, NextResponse } from 'next/server';
import { cronSyncProdutos } from '@/lib/estoque/cron';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Sync COMPLETO da tabela `produtos` (famílias + produtos + estoque) por conta.
// Porta o cron diário do app externo "Visual Estoque" — fonte de /visual-estoque.
// Disparado por cron com Bearer CRON_SECRET (1x/dia de madrugada).
//
// FIRE-AND-FORGET: o sync completo leva dezenas de minutos (rate limit da Omie) e
// o proxy do Railway corta requests HTTP longas (~5 min -> 502). Iniciamos em
// background e respondemos 200 já. O portal é um servidor node persistente, então
// a promise vive até o fim. O resultado vai para os logs.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  cronSyncProdutos()
    .then((r) => console.log('[cron sync-produtos] concluído', JSON.stringify(r)))
    .catch((e) => console.error('[cron sync-produtos] erro', (e as Error).message));
  return NextResponse.json({ sucesso: true, iniciado: true, timestamp: new Date().toISOString() });
}
