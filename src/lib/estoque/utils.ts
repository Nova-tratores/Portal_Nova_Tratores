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

/** True se mes (1-12)/ano é o mês corrente. */
export function ehMesAtual(mes: number, ano: number): boolean {
  const now = new Date();
  return mes === now.getMonth() + 1 && ano === now.getFullYear();
}

/** Dias úteis (seg-sex) em um mês inteiro. Não considera feriados. */
export function diasUteisDoMes(ano: number, mes: number): number {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  let count = 0;
  for (let d = 1; d <= ultimoDia; d++) {
    const dow = new Date(ano, mes - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/**
 * Dias úteis transcorridos do início do mês até hoje (inclusive). Se o mês não
 * for o atual, retorna o total de dias úteis do mês.
 */
export function diasUteisAteHoje(ano: number, mes: number): number {
  const now = new Date();
  const ehAtual = now.getFullYear() === ano && now.getMonth() + 1 === mes;
  const limite = ehAtual ? now.getDate() : new Date(ano, mes, 0).getDate();
  let count = 0;
  for (let d = 1; d <= limite; d++) {
    const dow = new Date(ano, mes - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/** Máscara CNPJ BR (00.000.000/0000-00) — usada para casar com Clientes_Omie. */
export function fmtCnpjBR(cnpj: string | null | undefined): string {
  const d = (cnpj || '').replace(/\D/g, '');
  if (d.length !== 14) return cnpj || '';
  return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12, 14);
}
