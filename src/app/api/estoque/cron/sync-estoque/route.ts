import { NextRequest, NextResponse } from 'next/server';
import { cronSyncEstoque } from '@/lib/estoque/cron';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Sync RÁPIDO: atualiza estoque/cmc/valor_estoque das linhas já existentes em
// `produtos`, mantendo o saldo do pátio fresco entre os syncs completos.
// Disparado por cron com Bearer CRON_SECRET (a cada poucas horas).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const resultados = await cronSyncEstoque();
    return NextResponse.json({ sucesso: true, resultados, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}
