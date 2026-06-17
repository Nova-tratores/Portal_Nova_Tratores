// Jobs agendados do módulo Estoque. Substituem os schedulers setInterval/
// setTimeout do monolito (agendarBackfillCMCDiario + refresh do mês atual).
// Cada job roda por conta concreta (getContasOmie). São disparados por rotas
// protegidas por Bearer CRON_SECRET (mesmo padrão de pos/cron/sync-omie).

import { getContasOmie } from './conta';
import { enriquecerCMCLote } from './cmc-admin';
import { buscarESalvarItensOmie } from './vendas-sync';
import { obterTotalOS } from './os';

/**
 * Backfill diário de CMC: para cada conta, enriquece vendas_itens sem
 * cmc_unitario em lotes até esgotar (ou bater o teto de iterações pra caber na
 * janela de execução). Espelha agendarBackfillCMCDiario do monolito.
 */
export async function cronBackfillCmc(): Promise<Record<string, unknown>> {
  const resultado: Record<string, unknown> = {};
  for (const c of getContasOmie()) {
    let enriquecidosTotal = 0;
    let iteracoes = 0;
    const MAX_ITER = 40; // teto de segurança (lote de 100 → até ~4000 itens/conta)
    while (iteracoes < MAX_ITER) {
      const r = await enriquecerCMCLote(c.id, 100);
      iteracoes++;
      enriquecidosTotal += r.enriquecidos || 0;
      // Para quando não há mais pendentes ou o lote não processou nada.
      if (!r.pendentesRestantes || (r.processados ?? 0) === 0) break;
    }
    resultado[c.id] = { enriquecidos: enriquecidosTotal, iteracoes };
  }
  return resultado;
}

/**
 * Sync incremental do mês atual: para cada conta, re-busca vendas do mês
 * corrente (buscarESalvarItensOmie) e atualiza o total de OS. Mantém o dashboard
 * quente sem depender de uma request da UI disparar o refresh em background.
 */
export async function cronSyncIncremental(): Promise<Record<string, unknown>> {
  const now = new Date();
  const mes = now.getMonth() + 1;
  const ano = now.getFullYear();
  const resultado: Record<string, unknown> = {};
  for (const c of getContasOmie()) {
    try {
      const itens = await buscarESalvarItensOmie(mes, ano, c.id);
      const totalOS = await obterTotalOS(mes, ano, c.id);
      resultado[c.id] = { itens: itens.length, totalOS };
    } catch (e) {
      resultado[c.id] = { erro: (e as Error).message };
    }
  }
  return resultado;
}
