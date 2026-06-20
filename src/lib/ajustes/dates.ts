// Helpers de data: Omie usa DD/MM/YYYY, Postgres/JS usam YYYY-MM-DD.
// Portado de src/dates.js.

export function parseBR(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseBRTimestamp(s: unknown): string | null {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}`;
  const d = parseBR(s);
  return d ? `${d} 00:00:00` : null;
}

export function fmtBR(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

export function fmtISO(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function hoje(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export function addDias(date: Date | string | number, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMeses(date: Date | string | number, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function inicioMes(ano: number, mes: number): Date {
  return new Date(ano, mes - 1, 1);
}

export function fimMes(ano: number, mes: number): Date {
  return new Date(ano, mes, 0);
}

/** Aceita "DD/MM/YYYY" ou "YYYY-MM-DD" e devolve um Date (00:00 local). */
export function parseAnyDate(s: unknown): Date | null {
  if (!s) return null;
  if (s instanceof Date) return s;
  const str = String(s).trim();
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Semana anterior completa (domingo a sábado) relativa a `ref` (default: hoje).
 * Ex.: hoje sexta 05/06 -> { de: dom 24/05, ate: sab 30/05 }.
 */
export function semanaAnterior(ref?: Date | string): { de: Date; ate: Date } {
  const base = ref ? (ref instanceof Date ? ref : parseAnyDate(ref) || hoje()) : hoje();
  const dow = base.getDay(); // 0=domingo .. 6=sabado
  const inicioSemanaAtual = addDias(new Date(base.getFullYear(), base.getMonth(), base.getDate()), -dow);
  return { de: addDias(inicioSemanaAtual, -7), ate: addDias(inicioSemanaAtual, -1) };
}
