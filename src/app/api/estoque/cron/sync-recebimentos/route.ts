import { NextRequest, NextResponse } from 'next/server';
import { sincronizarRecebimentosTodasContas } from '@/lib/estoque/recebimentos';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min

// Sync periódico de recebimentos (ListarRecebimentos -> recebimentos_nfe) para
// todas as contas. Substitui o setInterval do monolito (que, na prática, nunca
// existiu — a tabela era "mantida pelo Portal"). Disparado por cron com
// Bearer CRON_SECRET (a cada 15 min, janela 09-22 UTC).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const resultados = await sincronizarRecebimentosTodasContas();
    return NextResponse.json({ sucesso: true, resultados, timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}
