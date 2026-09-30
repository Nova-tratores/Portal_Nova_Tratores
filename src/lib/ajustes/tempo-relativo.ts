// "há 2 h", "há 3 dias"… para a faixa "espelho atualizado há X" das telas que
// leem tabelas sincronizadas da Omie. Puro (recebe o "agora") para ser testável.

export type NivelAtraso = 'ok' | 'atencao' | 'critico' | 'desconhecido';

export interface TempoRelativo {
  texto: string;
  nivel: NivelAtraso;
  horas: number | null;
}

/** Limiares: o cron nominal é de 3 h, na prática 5–8 h; acima de 9 h algo travou. */
export const LIMIAR_ATENCAO_H = 4;
export const LIMIAR_CRITICO_H = 9;

export function tempoRelativo(iso: string | null | undefined, agora: Date = new Date()): TempoRelativo {
  if (!iso) return { texto: 'sem registro de sincronização', nivel: 'desconhecido', horas: null };
  // Timestamps do cp_sync_log vêm SEM fuso ("2026-09-30T10:05:17.434") e são
  // UTC (new Date().toISOString() gravado no servidor). Forçamos o Z para o
  // navegador não interpretar como hora local.
  const s = String(iso);
  const comFuso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  const t = new Date(comFuso).getTime();
  if (!Number.isFinite(t)) return { texto: 'sem registro de sincronização', nivel: 'desconhecido', horas: null };
  const ms = Math.max(0, agora.getTime() - t);
  const min = Math.floor(ms / 60000);
  const horas = ms / 3600000;
  let texto: string;
  if (min < 1) texto = 'agora mesmo';
  else if (min < 60) texto = `há ${min} min`;
  else if (horas < 48) texto = `há ${Math.floor(horas)} h`;
  else texto = `há ${Math.floor(horas / 24)} dias`;
  const nivel: NivelAtraso = horas >= LIMIAR_CRITICO_H ? 'critico' : horas >= LIMIAR_ATENCAO_H ? 'atencao' : 'ok';
  return { texto, nivel, horas };
}
