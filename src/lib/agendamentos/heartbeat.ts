// Heartbeat + vigia de saúde dos crons/robôs.
//
// baterHeartbeat(job): o próprio job carimba `cron_heartbeat` a cada execução
// (mesmo rodando vazio). checarSaudeCrons(): lê os carimbos e, se um job crítico
// ficou mais velho que o limite, NOTIFICA OS ADMINS no sino.
//
// Por que heartbeat e não a GitHub Actions API? Porque não depende do
// GITHUB_TOKEN (pendente no Railway) e a fonte da verdade é o próprio job. E por
// que in-process (instrumentation.ts) e não um cron no GitHub? Porque o vigia SÓ
// lê Supabase + escreve notificação — não toca chave Omie —, então roda seguro
// dentro do processo do Railway (sempre de pé), sem o risco que um cron do GitHub
// (que às vezes pula) reintroduziria justamente ao vigia.

import { createClient } from '@supabase/supabase-js';
import { notificarAdmins } from '@/lib/server/audit-notify';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Carimba o "sinal de vida" de um job. Nunca lança (best-effort). */
export async function baterHeartbeat(
  job: string,
  opts: { status?: string; meta?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    await supabase.from('cron_heartbeat').upsert(
      { job, last_run_at: agora, last_status: opts.status || 'ok', meta: opts.meta || {}, updated_at: agora },
      { onConflict: 'job' },
    );
  } catch (e) {
    console.error('[heartbeat] falha ao carimbar', job, (e as Error).message);
  }
}

// Jobs vigiados: se o último heartbeat for mais velho que `maxHoras`, alerta.
interface Vigia { job: string; nome: string; maxHoras: number; link: string }
const VIGIAR: Vigia[] = [
  // Robô roda 2×/dia (08:00 + 13:00 UTC); 26h de folga cobre atraso do GitHub.
  { job: 'classificar-recebidos', nome: 'Robô de classificação de recebidos', maxHoras: 26, link: '/agendamentos' },
];

// Dedupe em memória: no máximo 1 alerta por job por dia (UTC). O reset no
// redeploy custa, no pior caso, 1 alerta extra — aceitável.
const jaAlertado = new Set<string>();

/** Varre os jobs vigiados e alerta os admins dos que pararam. Nunca lança. */
export async function checarSaudeCrons(): Promise<{ checados: number; alertados: string[] }> {
  const alertados: string[] = [];
  let checados = 0;
  const agora = Date.now();
  const hoje = new Date().toISOString().slice(0, 10);

  for (const v of VIGIAR) {
    try {
      const { data } = await supabase
        .from('cron_heartbeat')
        .select('last_run_at')
        .eq('job', v.job)
        .maybeSingle();
      const row = data as { last_run_at?: string } | null;

      // Sem carimbo ainda = nunca rodou desde o deploy. NÃO alerta (evita
      // falso-alarme de cold-start; a 1ª execução do job cria a linha).
      if (!row?.last_run_at) continue;
      checados++;

      const idadeH = (agora - new Date(row.last_run_at).getTime()) / 3_600_000;
      if (idadeH < v.maxHoras) continue;

      const chave = `${v.job}|${hoje}`;
      if (jaAlertado.has(chave)) continue;
      jaAlertado.add(chave);

      const horas = Math.floor(idadeH);
      await notificarAdmins({
        tipo: 'agendamentos',
        titulo: `⚠️ Robô parado: ${v.nome}`,
        descricao: `Sem execução há ~${horas}h (última em ${new Date(row.last_run_at).toLocaleString('pt-BR')} UTC). Confira em Agendamentos.`,
        link: v.link,
      });
      alertados.push(v.job);
    } catch (e) {
      console.error('[heartbeat] checarSaude falhou', v.job, (e as Error).message);
    }
  }
  return { checados, alertados };
}
