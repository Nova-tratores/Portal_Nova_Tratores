// Schedulers in-process do módulo Estoque.
//
// O Portal roda no Railway como processo Node longevo (`next start`), então
// `register()` (chamado 1x no boot do servidor) é o lugar certo pra agendar
// jobs — substitui os `vercel.json` crons, que NÃO disparam no Railway, e
// espelha os setInterval/setTimeout do monolito.
//
// Só roda no runtime nodejs (não no edge). Guard global evita agendar em
// duplicidade no HMR do `next dev`. As rotas /api/estoque/cron/* continuam
// existindo para disparo manual (protegidas por Bearer CRON_SECRET).
//
// CAVEAT: se o serviço escalar para >1 instância no Railway, cada instância
// roda seu próprio scheduler (jobs duplicados). Os jobs são best-effort/idempotentes
// (upserts), mesma característica do monolito. Manter 1 instância para os crons.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const g = globalThis as unknown as { __estoqueSchedulersStarted?: boolean };
  if (g.__estoqueSchedulersStarted) return;
  g.__estoqueSchedulersStarted = true;

  const { cronBackfillCmc, cronSyncIncremental } = await import('./lib/estoque/cron');

  const log = (msg: string) => console.log('[estoque scheduler] ' + msg);

  // sync-incremental: a cada 3h (mantém o mês atual quente sem depender da UI).
  const TRES_HORAS = 3 * 60 * 60 * 1000;
  setInterval(() => {
    cronSyncIncremental()
      .then((r) => log('sync-incremental ok: ' + JSON.stringify(r)))
      .catch((e) => log('sync-incremental falhou: ' + (e as Error).message));
  }, TRES_HORAS);

  // backfill-cmc: diário às 06:00 UTC (= 03:00 BRT, preserva o timing do monolito).
  const agendarBackfillDiario = () => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6, 0, 0));
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    log('backfill-cmc agendado para ' + next.toISOString());
    setTimeout(() => {
      cronBackfillCmc()
        .then((r) => log('backfill-cmc ok: ' + JSON.stringify(r)))
        .catch((e) => log('backfill-cmc falhou: ' + (e as Error).message))
        .finally(() => agendarBackfillDiario());
    }, delay);
  };
  agendarBackfillDiario();

  log('schedulers registrados (sync-incremental 3h, backfill-cmc 06:00 UTC)');
}
