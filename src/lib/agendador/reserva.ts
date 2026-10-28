// Rotas de cron que o GitHub ainda chama depois que o sync passou para o agendador do
// portal (Etapa 3 do plano docs/omie-fila-agendador-plano.md): o GitHub vira RESERVA —
// só roda se o agendador NÃO tiver terminado bem nas últimas `horas`.
import { supabaseAdmin } from '@/lib/server/supabase-admin';

/** Hora da última rodada boa do agendador (ou botão) nas últimas `horas`; null = não rodou. */
export async function agendadorJaRodou(job: string, horas = 20): Promise<string | null> {
  const desde = new Date(Date.now() - horas * 3600_000).toISOString();
  const { data } = await supabaseAdmin.from('cron_runs').select('iniciado_em')
    .eq('job', job).eq('status', 'ok').in('disparado_por', ['agendador', 'botao', 'marcado'])
    .gte('iniciado_em', desde).order('iniciado_em', { ascending: false }).limit(1);
  return data?.[0]?.iniciado_em ?? null;
}
