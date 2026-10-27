// Data e hora de Brasília para o que o SERVIDOR escreve ou mostra (José, 27/10/2026: "arruma o horário em
// todo o portal"). O Railway roda em UTC: getHours()/toLocale* sem fuso saíam 3 h adiantados. Use só com
// INSTANTES (agora, created_at…), nunca com data sem hora ("2026-10-27"), que viraria o dia anterior.
const TZ = "America/Sao_Paulo";

export function partesBR(d: Date = new Date()) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d)) p[x.type] = x.value;
  return { ano: p.year, mes: p.month, dia: p.day, hora: p.hour, min: p.minute, seg: p.second };
}

/** "27/10/2026 08:45" */
export function dataHoraBR(d: Date = new Date()): string {
  const p = partesBR(d);
  return `${p.dia}/${p.mes}/${p.ano} ${p.hora}:${p.min}`;
}

/** hora do dia em Brasília (0–23) */
export const horaBR = (d: Date = new Date()): number => Number(partesBR(d).hora);
