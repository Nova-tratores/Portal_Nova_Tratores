// ============================================================================
// Estado dos jobs de background no Supabase (tabela ajustes_jobs).
//
// Arquitetura WORKER-READY (decisão do plano): o app original guardava o estado
// dos scans/gerações em memória (state machines) e a UI fazia polling de um
// /status que lia essa memória. Aqui o estado vive no Supabase, então:
//   - início ↔ status ↔ execução ficam desacoplados do processo;
//   - sobrevive a deploy no meio de um job;
//   - mover o job para um worker dedicado depois é só mudança de deploy.
//
// Padrão de uso numa rota:
//   POST .../iniciar  -> criarJob(...) -> dispara o trabalho async (sem await)
//                        que vai chamando atualizarJob(...) -> retorna { jobId }
//   GET  .../status   -> lerJobAtivo(tipo, conta) -> devolve a última linha
// ============================================================================

import { supabase } from './supabase';
import type { Conta } from './conta';
import type { AjustesJob, JobStatus, JobTipo } from './types';

const TABELA = 'ajustes_jobs';

// Um job 'rodando' que fica sem atualizacao por mais de JOB_STALE_MS e' tratado
// como MORTO: o processo caiu ou houve deploy no meio (deploys sao automaticos a
// cada push no main). Sem isto, o job fica preso em 'rodando' para sempre e
// bloqueia toda tentativa nova.
// ATENCAO ao valor: um job LEGITIMO pode ficar minutos sem heartbeat durante uma
// unica chamada lenta do Omie (ex.: ListarPosEstoque de um local com milhares de
// produtos ja levou ~5 min sozinho; a geracao Mahindra inteira leva ~13 min).
// O limite tem de ser bem maior que o pior stall observado para nao matar um job
// vivo por engano — 20 min da margem e ainda auto-recupera de uma queda real.
export const JOB_STALE_MS = 20 * 60 * 1000;

/** True se o job esta 'rodando' E recebeu atualizacao recente (nao esta travado). */
export function jobEstaVivo(job: AjustesJob | null): boolean {
  if (!job || job.status !== 'rodando') return false;
  const ts = new Date(job.atualizado_em || job.iniciado_em).getTime();
  if (!Number.isFinite(ts)) return true; // sem timestamp confiavel: nao arrisca matar
  return Date.now() - ts < JOB_STALE_MS;
}

/** Cria um job (status 'rodando') e retorna o id. Lança em erro de banco. */
export async function criarJob(
  tipo: JobTipo,
  conta: Conta | null,
  criadoPor?: string | null,
): Promise<number> {
  const { data, error } = await supabase
    .from(TABELA)
    .insert({
      tipo,
      conta_omie: conta,
      status: 'rodando' as JobStatus,
      etapa: 'iniciando',
      criado_por: criadoPor || null,
    })
    .select('id')
    .single();
  if (error) throw new Error('Falha ao criar job: ' + error.message);
  return (data as { id: number }).id;
}

export interface AtualizacaoJob {
  etapa?: string;
  progresso?: Record<string, unknown>;
  status?: JobStatus;
  resultado?: Record<string, unknown>;
  erro?: string;
}

/** Atualiza um job. Não lança (best-effort: um job não deve morrer por erro de log). */
export async function atualizarJob(id: number, patch: AtualizacaoJob): Promise<void> {
  const update: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (patch.etapa !== undefined) update.etapa = patch.etapa;
  if (patch.progresso !== undefined) update.progresso = patch.progresso;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.resultado !== undefined) update.resultado = patch.resultado;
  if (patch.erro !== undefined) update.erro = patch.erro;
  try {
    await supabase.from(TABELA).update(update).eq('id', id);
  } catch {
    /* best-effort */
  }
}

/** Marca o job como concluído com resultado. */
export async function concluirJob(id: number, resultado: Record<string, unknown>): Promise<void> {
  await atualizarJob(id, { status: 'concluido', etapa: 'concluido', resultado });
}

/** Marca o job como erro. */
export async function falharJob(id: number, erro: string): Promise<void> {
  await atualizarJob(id, { status: 'erro', erro });
}

/** Lê um job pelo id. */
export async function lerJob(id: number): Promise<AjustesJob | null> {
  const { data } = await supabase.from(TABELA).select('*').eq('id', id).single();
  return (data as AjustesJob) || null;
}

/**
 * Última linha de um job por tipo (e conta, se informada) — para a rota /status.
 * Retorna null se nunca rodou.
 */
export async function lerJobAtivo(tipo: JobTipo, conta?: Conta | null): Promise<AjustesJob | null> {
  let q = supabase
    .from(TABELA)
    .select('*')
    .eq('tipo', tipo)
    .order('iniciado_em', { ascending: false })
    .limit(1);
  if (conta) q = q.eq('conta_omie', conta);
  const { data } = await q;
  return ((data as AjustesJob[]) || [])[0] || null;
}

/**
 * True se há um job desse tipo (e conta) REALMENTE em andamento — para evitar
 * duplicar. Um job 'rodando' porém travado (processo morto) é marcado como erro
 * aqui mesmo e liberado, para não bloquear novas execuções para sempre.
 */
export async function jobRodando(tipo: JobTipo, conta?: Conta | null): Promise<boolean> {
  const ativo = await lerJobAtivo(tipo, conta);
  if (!ativo || ativo.status !== 'rodando') return false;
  if (jobEstaVivo(ativo)) return true;
  await falharJob(ativo.id, 'Processo interrompido (o servidor reiniciou durante a execução). Tente novamente.');
  return false;
}
