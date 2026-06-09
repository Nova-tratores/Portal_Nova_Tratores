// Helpers de data/formatação portados do monolito server.js.

export const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MESES_LABEL = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data no formato Omie dd/mm/aaaa. */
export function fmtD(d: Date): string {
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
}

/** Período curto "Mmm/aaaa" (ex.: Jan/2025). */
export function fmtP(d: Date): string {
  return MESES_CURTO[d.getMonth()] + '/' + d.getFullYear();
}

/** Parseia data BR dd/mm/aaaa para Date (epoch 0 se inválida). */
export function parseDataBR(s: string | null | undefined): Date {
  if (!s) return new Date(0);
  const p = s.split('/');
  return p.length === 3 ? new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0])) : new Date(0);
}

/** Label de período tipo "JAN25" para gráficos (mês + 2 dígitos do ano). */
export function labelMesAno(d: Date): string {
  return MESES_LABEL[d.getMonth()] + String(d.getFullYear()).slice(2);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
