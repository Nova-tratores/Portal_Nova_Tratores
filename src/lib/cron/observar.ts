// Observabilidade + trava dos crons (recomendação #3). Envolve o trabalho de um
// cron registrando início/fim/duração/status na tabela `cron_runs`. Se `lockMinutos`
// e já existe um run ABERTO recente do mesmo job, PULA (evita sobreposição).
//
// Degrada com elegância: se a tabela/serviço não existir, tudo vira no-op (try/catch)
// e o cron roda normalmente — então dá pra fazer deploy do código ANTES da migration.
import { createClient } from '@supabase/supabase-js';
import { comPrioridade, type Prioridade } from '@/lib/omie/porta';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false } }) : null;

export interface CronRunResultado<T> {
  pulado: boolean;      // true = havia run aberto (trava) → não executou
  resultado?: T;
  erro?: string;
  bloqueio?: boolean;   // executou mas tomou bloqueio 425 da Omie
}

// Rodadas abertas NESTE processo — para marcar "interrompida" se o servidor desligar
// no meio (deploy). Sobrevive ao HMR do dev.
const G = globalThis as unknown as { __cronRunsAbertos?: Map<number, string> };
const abertos = (G.__cronRunsAbertos ??= new Map<number, string>());

export interface OpcoesCronRun<T> {
  lockMinutos?: number;
  prioridade?: Prioridade;
  /** agendador | github | botao | marcado — aparece na tela /agendamentos. */
  disparadoPor?: string;
  /** Nome de quem apertou / marcou. */
  quem?: string;
  /** Como fechar a rodada a partir do resultado (ex.: status pulado, resumo em detalhe). */
  fechamento?: (r: T) => { status?: string; detalhe?: string; progresso?: Record<string, string> } | undefined;
}

/**
 * Executa `fn` medindo e registrando em `cron_runs`. `lockMinutos` (opcional) ativa a
 * trava: se há run aberto do mesmo `job` iniciado há menos de `lockMinutos`, pula.
 */
export async function comCronRun<T>(
  job: string,
  fn: () => Promise<T>,
  opts: OpcoesCronRun<T> = {},
): Promise<CronRunResultado<T>> {
  // Trava opcional: pula se já há execução aberta recente.
  if (sb && opts.lockMinutos && opts.lockMinutos > 0) {
    try {
      const desde = new Date(Date.now() - opts.lockMinutos * 60_000).toISOString();
      const { data } = await sb
        .from('cron_runs')
        .select('id')
        .eq('job', job)
        .is('finalizado_em', null)
        .gte('iniciado_em', desde)
        .limit(1);
      if (data && data.length) return { pulado: true };
    } catch { /* sem trava se o banco falhar */ }
  }

  // Abre o registro. As colunas disparado_por/quem vêm da migration sql/agendador.sql;
  // sem ela, grava sem elas.
  let id: number | null = null;
  if (sb) {
    try {
      const extra: Record<string, unknown> = {};
      if (opts.disparadoPor) extra.disparado_por = opts.disparadoPor;
      if (opts.quem) extra.quem = opts.quem;
      let r = await sb.from('cron_runs').insert({ job, status: 'rodando', ...extra }).select('id').single();
      if (r.error && Object.keys(extra).length) r = await sb.from('cron_runs').insert({ job, status: 'rodando' }).select('id').single();
      id = (r.data as { id?: number } | null)?.id ?? null;
    } catch { /* segue sem registro */ }
  }
  if (id != null) abertos.set(id, job);

  const t0 = Date.now();
  const fechar = async (patch: Record<string, unknown>) => {
    if (!sb || id == null) return;
    abertos.delete(id);
    const base = { finalizado_em: new Date().toISOString(), duracao_ms: Date.now() - t0 };
    try {
      const r = await sb.from('cron_runs').update({ ...base, ...patch }).eq('id', id);
      if (r.error && 'progresso' in patch) {
        const semProgresso = { ...patch };
        delete semProgresso.progresso;
        await sb.from('cron_runs').update({ ...base, ...semProgresso }).eq('id', id);
      }
    } catch { /* best-effort */ }
  };

  try {
    // Toda chamada à Omie feita dentro do job entra na fila da porta única com esta
    // prioridade (padrão 'pesado'): quem está na tela passa na frente.
    const resultado = await comPrioridade(opts.prioridade ?? 'pesado', fn);
    const f = opts.fechamento?.(resultado);
    await fechar({
      status: f?.status ?? 'ok',
      ...(f?.detalhe ? { detalhe: f.detalhe.slice(0, 500) } : {}),
      ...(f?.progresso ? { progresso: f.progresso } : {}),
    });
    return { pulado: false, resultado };
  } catch (e) {
    const err = e as { message?: string; bloqueio?: boolean };
    const bloqueio = err?.bloqueio === true; // OmieBloqueioError expõe .bloqueio
    await fechar({ status: bloqueio ? 'bloqueio' : 'erro', bloqueio, detalhe: (err?.message || String(e)).slice(0, 500) });
    return { pulado: false, erro: err?.message || String(e), bloqueio };
  }
}

/** Desligamento (SIGTERM): marca as rodadas abertas deste processo como interrompidas. */
export async function marcarInterrompidas(motivo = 'O servidor reiniciou durante a execução (deploy).'): Promise<number> {
  const ids = [...abertos.keys()];
  if (!sb || !ids.length) return 0;
  abertos.clear();
  try {
    await sb.from('cron_runs').update({ status: 'interrompida', finalizado_em: new Date().toISOString(), detalhe: motivo }).in('id', ids);
  } catch { /* best-effort */ }
  return ids.length;
}

/**
 * Na subida do processo: toda rodada que ficou "rodando" de antes do boot morreu com
 * o processo anterior (os jobs rodam todos dentro do portal) — fecha como interrompida.
 */
export async function fecharOrfas(bootEm: Date): Promise<number> {
  if (!sb) return 0;
  try {
    const { data } = await sb.from('cron_runs')
      .update({ status: 'interrompida', finalizado_em: new Date().toISOString(), detalhe: 'O servidor reiniciou durante a execução.' })
      .is('finalizado_em', null)
      .lt('iniciado_em', bootEm.toISOString())
      .select('id');
    return data?.length ?? 0;
  } catch { return 0; }
}
