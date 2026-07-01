// Jobs agendados do módulo Estoque. Substituem os schedulers setInterval/
// setTimeout do monolito (agendarBackfillCMCDiario + refresh do mês atual).
// Cada job roda por conta concreta (getContasOmie). São disparados por rotas
// protegidas por Bearer CRON_SECRET (mesmo padrão de pos/cron/sync-omie).

import { getContasOmie, type Conta } from './conta';
import { enriquecerCMCLote } from './cmc-admin';
import { buscarESalvarItensOmie } from './vendas-sync';
import { obterTotalOS } from './os';
import { sincronizarProdutos, sincronizarApenasEstoque } from './produtos-sync';
import { capturarSnapshotMensal, capturarSnapshotTipoMensal, backfillSnapshotsHistoricos } from './cruzamento-familia';
import { sincronizarComprasJanela } from './compras-sync';
import { sincronizarRemessas, sincronizarMovimentacao, sincronizarOutrasEntradas, cruzarDevolucoes, detectarDevolucoesDemonstracao } from '../visual-estoque/remessas-sync';

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

/**
 * Sync COMPLETO da tabela `produtos` (famílias + produtos + estoque) por conta.
 * Porta o cron diário do app externo "Visual Estoque" — é a fonte que alimenta
 * /visual-estoque. Job longo: rodar 1x/dia de madrugada.
 */
export async function cronSyncProdutos(): Promise<Record<string, unknown>> {
  const resultado: Record<string, unknown> = {};
  for (const c of getContasOmie()) {
    try {
      const sync = await sincronizarProdutos(c.id);
      const snapshot = await capturarSnapshotMensal(c.id).catch((e) => ({ erro: (e as Error).message }));
      const snapshotTipo = await capturarSnapshotTipoMensal(c.id).catch((e) => ({ erro: (e as Error).message }));
      resultado[c.id] = { ...sync, snapshot, snapshotTipo };
    } catch (e) {
      resultado[c.id] = { ok: false, erro: (e as Error).message };
    }
  }
  return resultado;
}

/**
 * Sync RÁPIDO: só atualiza estoque/cmc/valor_estoque das linhas já existentes em
 * `produtos`. Mantém o saldo do pátio fresco entre os syncs completos.
 */
export async function cronSyncEstoque(): Promise<Record<string, unknown>> {
  const resultado: Record<string, unknown> = {};
  for (const c of getContasOmie()) {
    try {
      const sync = await sincronizarApenasEstoque(c.id);
      const snapshot = await capturarSnapshotMensal(c.id).catch((e) => ({ erro: (e as Error).message }));
      const snapshotTipo = await capturarSnapshotTipoMensal(c.id).catch((e) => ({ erro: (e as Error).message }));
      resultado[c.id] = { ...sync, snapshot, snapshotTipo };
    } catch (e) {
      resultado[c.id] = { ok: false, erro: (e as Error).message };
    }
  }
  return resultado;
}

/**
 * Captura o snapshot mensal de estoque por família (mês corrente), por conta.
 * Roda junto do sync de estoque/produtos, mas também pode ser disparado avulso
 * para semear o histórico imediatamente.
 */
export async function cronSnapshotEstoque(): Promise<Record<string, unknown>> {
  const resultado: Record<string, unknown> = {};
  for (const c of getContasOmie()) {
    try {
      const familia = await capturarSnapshotMensal(c.id);
      const tipo = await capturarSnapshotTipoMensal(c.id).catch((e) => ({ erro: (e as Error).message }));
      resultado[c.id] = { familia, tipo };
    } catch (e) {
      resultado[c.id] = { erro: (e as Error).message };
    }
  }
  return resultado;
}

/**
 * Sync INCREMENTAL de compras/notas de entrada (últimos `mesesAtras` meses) por
 * conta. Mantém `notas_entrada` fresca (NOVA + CASTRO) sem rebuild total, e
 * atualiza o vínculo de produto (nCodProd) das notas recentes. Sequencial por
 * conta (cada conta apaga+reescreve só a janela).
 */
export async function cronSyncCompras(mesesAtras = 3): Promise<Record<string, unknown>> {
  const resultado: Record<string, unknown> = {};
  for (const c of getContasOmie()) {
    try {
      resultado[c.id] = await sincronizarComprasJanela(c.id, mesesAtras);
    } catch (e) {
      resultado[c.id] = { ok: false, erro: (e as Error).message };
    }
  }
  return resultado;
}

/**
 * Backfill do snapshot histórico de estoque por família, consultando a posição
 * de estoque na Omie no fim de cada mês desde `desde` até hoje. Por conta.
 * Job longo (consulta pesada à Omie) — disparar em background.
 */
export async function cronBackfillSnapshots(
  desde: { ano: number; mes: number },
  contaUnica?: Conta,
  ate?: { ano: number; mes: number },
): Promise<Record<string, unknown>> {
  const contas = contaUnica ? [{ id: contaUnica }] : getContasOmie();
  const resultado: Record<string, unknown> = {};
  for (const c of contas) {
    try {
      resultado[c.id] = await backfillSnapshotsHistoricos(c.id, desde, ate);
    } catch (e) {
      resultado[c.id] = { erro: (e as Error).message };
    }
  }
  return resultado;
}

/**
 * Sync das fontes da tela Remessas do Visual Estoque (remessas ->
 * movimentacao_produtos pendentes -> outras_entradas), por conta. Porta os syncs
 * de remessa/movimentação/outras-entradas do app externo "Visual Estoque".
 * Job médio: rodar 1-2x/dia.
 */
export async function cronSyncRemessas(): Promise<Record<string, unknown>> {
  const resultado: Record<string, unknown> = {};
  for (const c of getContasOmie()) {
    try {
      const remessas = await sincronizarRemessas(c.id);
      const movimentacao = await sincronizarMovimentacao(c.id);
      const outrasEntradas = await sincronizarOutrasEntradas(c.id);
      const devolucoes = await cruzarDevolucoes(c.id);
      // Encerra demos já devolvidas (MovimentoEstoque) p/ não acumular pendentes.
      const demosEncerradas = await detectarDevolucoesDemonstracao(c.id);
      resultado[c.id] = { remessas, movimentacao, outrasEntradas, devolucoes, demosEncerradas };
    } catch (e) {
      resultado[c.id] = { ok: false, erro: (e as Error).message };
    }
  }
  return resultado;
}
