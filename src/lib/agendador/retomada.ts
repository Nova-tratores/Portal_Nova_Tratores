// Retomada de tarefas longas do agendador: guarda, por agendamento e por DIA (Brasília),
// o que já foi concluído. Se um deploy interromper a rodada, o motor roda de novo no
// mesmo dia (rodada "interrompida" não conta como feita) e a tarefa pula o que já fez.
// Fica em agendamentos.parametros._retomada — sem tabela nova.

import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';

export interface Retomada { dia: string; feitos: string[] }

export const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

async function lerParametros(chave: string): Promise<Record<string, unknown>> {
  const { data } = await sb.from('agendamentos').select('parametros').eq('chave', chave).maybeSingle();
  return (data?.parametros as Record<string, unknown>) || {};
}

/** O que já foi feito HOJE por este agendamento (vazio se for outro dia). */
export async function lerRetomada(chave: string): Promise<string[]> {
  const r = (await lerParametros(chave))._retomada as Retomada | undefined;
  return r && r.dia === hojeSP() ? r.feitos : [];
}

/** Marca uma parte como feita hoje. Best-effort: falha aqui não derruba a tarefa. */
export async function marcarFeito(chave: string, parte: string): Promise<void> {
  try {
    const p = await lerParametros(chave);
    const atual = p._retomada as Retomada | undefined;
    const feitos = atual && atual.dia === hojeSP() ? atual.feitos : [];
    if (feitos.includes(parte)) return;
    await sb.from('agendamentos').update({ parametros: { ...p, _retomada: { dia: hojeSP(), feitos: [...feitos, parte] } } }).eq('chave', chave);
  } catch { /* segue */ }
}

/** Rodada terminou inteira: apaga a retomada (ela só serve para rodada interrompida). */
export async function limparRetomada(chave: string): Promise<void> {
  try {
    const p = await lerParametros(chave);
    if (!('_retomada' in p)) return;
    const resto = { ...p };
    delete resto._retomada;
    await sb.from('agendamentos').update({ parametros: resto }).eq('chave', chave);
  } catch { /* segue */ }
}
