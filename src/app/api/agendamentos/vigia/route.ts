// Dispara a checagem de saúde dos crons sob demanda (mesmo motor do vigia
// in-process). Útil pra testar e como backup manual. Só com o CRON_SECRET (sem a
// env no ambiente, recusa — antes ficava aberta).
import { NextRequest, NextResponse } from 'next/server';
import { ehChamadaInterna } from '@/lib/auth/chamada-interna';
import { checarSaudeCrons } from '@/lib/agendamentos/heartbeat';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!ehChamadaInterna(req.headers)) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  }
  const r = await checarSaudeCrons();
  return NextResponse.json({ ok: true, ...r });
}
