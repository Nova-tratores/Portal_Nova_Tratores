// Observabilidade + trava dos crons (recomendação #3). Envolve o trabalho de um
// cron registrando início/fim/duração/status na tabela `cron_runs`. Se `lockMinutos`
// e já existe um run ABERTO recente do mesmo job, PULA (evita sobreposição).
//
// Degrada com elegância: se a tabela/serviço não existir, tudo vira no-op (try/catch)
// e o cron roda normalmente — então dá pra fazer deploy do código ANTES da migration.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const sb = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false } }) : null;

export interface CronRunResultado<T> {
  pulado: boolean;      // true = havia run aberto (trava) → não executou
  resultado?: T;
  erro?: string;
  bloqueio?: boolean;   // executou mas tomou bloqueio 425 da Omie
}

/**
 * Executa `fn` medindo e registrando em `cron_runs`. `lockMinutos` (opcional) ativa a
 * trava: se há run aberto do mesmo `job` iniciado há menos de `lockMinutos`, pula.
 */
export async function comCronRun<T>(
  job: string,
  fn: () => Promise<T>,
  opts: { lockMinutos?: number } = {},
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

  // Abre o registro.
  let id: number | null = null;
  if (sb) {
    try {
      const { data } = await sb.from('cron_runs').insert({ job, status: 'rodando' }).select('id').single();
      id = (data as { id?: number } | null)?.id ?? null;
    } catch { /* segue sem registro */ }
  }

  const t0 = Date.now();
  const fechar = async (patch: Record<string, unknown>) => {
    if (!sb || id == null) return;
    try { await sb.from('cron_runs').update({ finalizado_em: new Date().toISOString(), duracao_ms: Date.now() - t0, ...patch }).eq('id', id); } catch { /* best-effort */ }
  };

  try {
    const resultado = await fn();
    await fechar({ status: 'ok' });
    return { pulado: false, resultado };
  } catch (e) {
    const err = e as { message?: string; bloqueio?: boolean };
    const bloqueio = err?.bloqueio === true; // OmieBloqueioError expõe .bloqueio
    await fechar({ status: bloqueio ? 'bloqueio' : 'erro', bloqueio, detalhe: (err?.message || String(e)).slice(0, 500) });
    return { pulado: false, erro: err?.message || String(e), bloqueio };
  }
}
