import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { getContasOmie } from '@/lib/estoque/conta';
import { backfillOsServicos } from '@/lib/estoque/os-backfill';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // o job roda em background

// Backfill de os_servicos_itens (popup do card Serviços): sincroniza todos os
// meses que ainda não têm itens. ?conta=NOVA|CASTRO opcional (default: todas,
// em sequência); ?forcar=1 regrava até meses já preenchidos. Bearer CRON_SECRET.
//
// FIRE-AND-FORGET: responde 200 na hora; progresso no /status e nos logs.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const conta = parseConta(sp.get('conta'));
  const contas = conta ? [conta] : getContasOmie().map((c) => c.id);
  const forcar = sp.get('forcar') === '1';

  backfillOsServicos(contas, forcar)
    .catch((e) => console.error('[cron backfill-os-servicos] erro', (e as Error).message));

  return NextResponse.json({ sucesso: true, iniciado: true, contas, forcar, timestamp: new Date().toISOString() });
}
