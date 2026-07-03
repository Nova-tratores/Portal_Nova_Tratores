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

  const log = (msg: string) => console.log('[estoque scheduler] ' + msg);

  // sync-incremental e backfill-cmc FORAM MOVIDOS para GitHub Actions (crons
  // dedicados: estoque-sync-incremental / estoque-backfill-cmc). Rodá-los aqui
  // TAMBÉM causava execução em duplicidade e disputa na mesma chave Omie.
  // Aqui ficam só os jobs que NÃO têm cron no GitHub (abaixo).

  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const CINCO_MIN = 5 * 60 * 1000;

  // Financeiro — CRIAÇÃO de cards (scanner OS + Peças) a cada 5 min.
  // DESLIGADO por padrão (a criação em tempo real é feita pelo WEBHOOK do Omie).
  // Só liga com SYNC_FINANCEIRO_AUTO=on, como backup caso o webhook falhe.
  if (process.env.SYNC_FINANCEIRO_AUTO === 'on') {
    const rodarSyncFinanceiro = async () => {
      for (const path of ['/api/financeiro/sync-os', '/api/financeiro/sync-pecas?dias=3']) {
        try { await fetch(`${base}${path}`, { method: 'POST' }); } catch (e) { log('sync financeiro falhou: ' + (e as Error).message); }
      }
    };
    setInterval(() => { rodarSyncFinanceiro().catch(() => {}); }, CINCO_MIN);
    setTimeout(() => { rodarSyncFinanceiro().catch(() => {}); }, 60 * 1000); // 1ª rodada ~1min após o boot
    log('financeiro auto-sync (scanner) LIGADO (SYNC_FINANCEIRO_AUTO=on)');
  } else {
    log('financeiro auto-sync (scanner) DESLIGADO — criação via webhook. SYNC_FINANCEIRO_AUTO=on liga o backup.');
  }

  // Lembrete NFS-e sem PDF: cobra o Pós-Vendas a cada 5 min até alguém anexar a
  // nota de serviço. SEMPRE ligado — só NOTIFICA, não cria card nem toca no Omie.
  const rodarLembreteNF = async () => {
    try { await fetch(`${base}/api/financeiro/lembrete-nf-servico`, { method: 'POST' }); } catch (e) { log('lembrete-nf-servico falhou: ' + (e as Error).message); }
  };
  setInterval(() => { rodarLembreteNF().catch(() => {}); }, CINCO_MIN);
  setTimeout(() => { rodarLembreteNF().catch(() => {}); }, 120 * 1000); // 1ª rodada ~2min após o boot

  // Pasta Cliente: vigia OS/PV/NFs novas (alteradas na última 1h) a cada 5 min.
  // SÓ atualiza as tabelas da pasta (portal_nt_clientes_*) + baixa as NFs — NÃO cria
  // card no financeiro. É o que garante a NF aparecer sozinha na pasta do cliente.
  const rodarSyncClientes = async () => {
    try { await fetch(`${base}/api/clientes/sync-recente`); } catch (e) { log('sync-recente clientes falhou: ' + (e as Error).message); }
  };
  setInterval(() => { rodarSyncClientes().catch(() => {}); }, CINCO_MIN);
  setTimeout(() => { rodarSyncClientes().catch(() => {}); }, 90 * 1000); // 1ª rodada ~1min30 após o boot

  log('schedulers registrados (lembrete-nf 5min, pasta-cliente 5min; financeiro-scanner sob SYNC_FINANCEIRO_AUTO). sync-incremental e backfill-cmc agora no GitHub Actions.');
}
