import { NextRequest, NextResponse } from 'next/server';
import { cronSyncNotasSaida } from '@/lib/ajustes/cron';
import { comCronRun } from '@/lib/cron/observar';
import { agendadorJaRodou } from '@/lib/agendador/reserva';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const CRON_SECRET = process.env.CRON_SECRET || '';
function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || '';
  return !!CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // RESERVA (05/11/2026): o agendador do portal roda este sync no worker (tarefa ajustes-sync-notas).
  // O GitHub só roda se o portal não tiver rodado bem nas últimas 4 h.
  const feito = await agendadorJaRodou('ajustes-sync-notas', 4);
  if (feito) return NextResponse.json({ ok: true, pulado: `o agendador do portal já rodou (${feito})` });
  const r = await comCronRun('ajustes-sync-notas', () => cronSyncNotasSaida(), { lockMinutos: 25 });
  if (r.erro) return NextResponse.json({ sucesso: false, erro: r.erro }, { status: 500 });
  return NextResponse.json({ sucesso: true, pulado: r.pulado, resultado: r.resultado, timestamp: new Date().toISOString() });
}

// POST = mesmo cron (função, não alias: a trava de rotas confere cada método).
export async function POST(req: NextRequest) {
  return GET(req);
}
