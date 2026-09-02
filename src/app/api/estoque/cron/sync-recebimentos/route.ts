import { NextRequest, NextResponse } from 'next/server';
import { sincronizarRecebimentosTodasContas } from '@/lib/estoque/recebimentos';
import { comCronRun } from '@/lib/cron/observar';

const CRON_SECRET = process.env.CRON_SECRET || '';

export const dynamic = 'force-dynamic';

// Sync periódico de recebimentos (ListarRecebimentos -> recebimentos_nfe) para
// todas as contas. Substitui o setInterval do monolito (que, na prática, nunca
// existiu — a tabela era "mantida pelo Portal"). Disparado por cron com
// Bearer CRON_SECRET (a cada 15 min, janela 09-22 UTC).
//
// FIRE-AND-FORGET (202): o sync varre todas as páginas de todas as contas com
// cExibirDetalhes:'S' + sleep(1s)/página e passa dos 5 min — o proxy do Railway
// corta requisições longas com 502 (era a causa das falhas do cron). Por isso
// disparamos em background e respondemos na hora, como o cron da DRE. A trava
// `estado.rodando` (em memória, por conta) evita sobreposição entre rodadas.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  comCronRun('estoque-sync-recebimentos', () => sincronizarRecebimentosTodasContas(), { lockMinutos: 20 })
    .then((r) => { if (r.pulado) console.log('[cron sync-recebimentos] pulado (já rodando)'); else if (r.erro) console.error('[cron sync-recebimentos bg]', r.erro); })
    .catch((e) => console.error('[cron sync-recebimentos bg]', (e as Error).message));
  return NextResponse.json({ ok: true, background: true, timestamp: new Date().toISOString() }, { status: 202 });
}
