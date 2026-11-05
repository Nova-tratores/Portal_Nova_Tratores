import { NextRequest, NextResponse } from 'next/server';
import { parseConta } from '@/lib/estoque/conta';
import { getContasOmie } from '@/lib/estoque/conta';
import { backfillOsServicos } from '@/lib/estoque/os-backfill';
import { agendadorJaRodou } from '@/lib/agendador/reserva';

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

  // RESERVA (05/11/2026): o agendador do portal roda este sync no worker (tarefa estoque-backfill-os-servicos).
  // O GitHub só roda se o portal não tiver rodado bem nas últimas 26 h.
  if (!forcar && !conta) {
    const feito = await agendadorJaRodou('estoque-backfill-os-servicos', 26);
    if (feito) return NextResponse.json({ ok: true, pulado: `o agendador do portal já rodou (${feito})` });
  }
  backfillOsServicos(contas, forcar)
    .catch((e) => console.error('[cron backfill-os-servicos] erro', (e as Error).message));

  return NextResponse.json({ sucesso: true, iniciado: true, contas, forcar, timestamp: new Date().toISOString() });
}
