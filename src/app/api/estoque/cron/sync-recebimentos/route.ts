import { NextRequest, NextResponse } from 'next/server';
import { sincronizarRecebimentosTodasContas } from '@/lib/estoque/recebimentos';
import { comCronRun } from '@/lib/cron/observar';
import { sincronizarAlocacao } from '@/lib/pecas/alocacao-server';
import { agendadorJaRodou } from '@/lib/agendador/reserva';

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
  // RESERVA (04/11/2026): o agendador do portal roda o sync completo às 22:00 no worker
  // (tarefa estoque-sync-recebimentos); de dia o recente de 45 dias roda a cada 10 min.
  // O GitHub só roda se o portal não tiver rodado bem nas últimas 26 h.
  const feito = await agendadorJaRodou('estoque-sync-recebimentos', 26);
  if (feito) return NextResponse.json({ ok: true, pulado: `o agendador do portal já rodou (${feito})` });
  comCronRun('estoque-sync-recebimentos', async () => {
    const sync = await sincronizarRecebimentosTodasContas();
    // Depois do espelho atualizado: abre demanda de ALOCAÇÃO para peça recebida sem
    // locação e fecha as já alocadas. Erro aqui não pode derrubar o sync.
    try {
      const a = await sincronizarAlocacao();
      if (a.pulado) console.log('[alocacao]', a.pulado);
      else if (a.abertas || a.fechadas) console.log(`[alocacao] abertas=${a.abertas} (${a.pecasNovas} peças) fechadas=${a.fechadas} notificados=${a.notificados}`);
    } catch (e) { console.error('[alocacao] erro', (e as Error).message); }
    return sync;
  }, { lockMinutos: 20, disparadoPor: 'github' })
    .then((r) => { if (r.pulado) console.log('[cron sync-recebimentos] pulado (já rodando)'); else if (r.erro) console.error('[cron sync-recebimentos bg]', r.erro); })
    .catch((e) => console.error('[cron sync-recebimentos bg]', (e as Error).message));
  return NextResponse.json({ ok: true, background: true, timestamp: new Date().toISOString() }, { status: 202 });
}
