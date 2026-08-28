// Dispara a checagem de saúde dos crons sob demanda (mesmo motor do vigia
// in-process). Útil pra testar e como backup manual. Protegido por CRON_SECRET
// quando a env existe.
import { NextRequest, NextResponse } from 'next/server';
import { checarSaudeCrons } from '@/lib/agendamentos/heartbeat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  const r = await checarSaudeCrons();
  return NextResponse.json({ ok: true, ...r });
}
