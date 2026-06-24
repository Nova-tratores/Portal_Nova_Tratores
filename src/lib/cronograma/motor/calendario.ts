// ════════════════════════════════════════════════════════════════════
// Aritmética de calendário (a base do motor)
// Datas são strings ISO 'YYYY-MM-DD'. Tudo em UTC para não sofrer com
// fuso/horário de verão. Dias da semana em ISO: 1=segunda ... 7=domingo.
// ════════════════════════════════════════════════════════════════════

import type { Calendario } from './tipos';

export const EPS = 1e-6;

// Limite de varredura para evitar laço infinito (ex.: calendário sem
// nenhum dia útil). ~50 anos de dias.
const MAX_SCAN = 366 * 50;

// ── conversão data ↔ string ─────────────────────────────────────────
export function parseData(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function fmtData(dt: Date): string {
  const a = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

export function addDias(iso: string, n: number): string {
  const dt = parseData(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtData(dt);
}

// ISO weekday 1..7 (segunda..domingo)
export function diaSemanaISO(iso: string): number {
  const js = parseData(iso).getUTCDay(); // 0=dom ... 6=sáb
  return js === 0 ? 7 : js;
}

// comparação direta funciona em strings 'YYYY-MM-DD'
export const menorData = (a: string, b: string) => (a < b ? a : b);
export const maiorData = (a: string, b: string) => (a > b ? a : b);

// ── núcleo: é dia útil? ──────────────────────────────────────────────
export function ehDiaUtil(cal: Calendario, iso: string): boolean {
  for (const e of cal.excecoes) {
    if (e.data === iso) {
      if (e.tipo === 'folga') return false; // feriado/folga remove o dia
      if (e.tipo === 'extra') return true; // dia extra fora do padrão
    }
  }
  return cal.diasSemana.includes(diaSemanaISO(iso));
}

// primeiro dia útil >= iso
export function proximoDiaUtil(cal: Calendario, iso: string): string {
  let cur = iso;
  for (let i = 0; i < MAX_SCAN; i++) {
    if (ehDiaUtil(cal, cur)) return cur;
    cur = addDias(cur, 1);
  }
  throw new Error(`Calendário ${cal.id} sem dia útil a partir de ${iso}`);
}

// primeiro dia útil <= iso
export function diaUtilAnterior(cal: Calendario, iso: string): string {
  let cur = iso;
  for (let i = 0; i < MAX_SCAN; i++) {
    if (ehDiaUtil(cal, cur)) return cur;
    cur = addDias(cur, -1);
  }
  throw new Error(`Calendário ${cal.id} sem dia útil até ${iso}`);
}

// próximo/anterior dia útil ESTRITAMENTE depois/antes de iso
const passoFrente = (cal: Calendario, iso: string) =>
  proximoDiaUtil(cal, addDias(iso, 1));
const passoTras = (cal: Calendario, iso: string) =>
  diaUtilAnterior(cal, addDias(iso, -1));

// Desloca `n` dias úteis (n>0 frente, n<0 trás, n=0 fica). Para lag.
// `n` fracionário é arredondado (lag fracionário é raro).
export function deslocarDiasUteis(cal: Calendario, iso: string, n: number): string {
  const k = Math.round(n);
  let cur = iso;
  for (let i = 0; i < Math.abs(k); i++) {
    cur = k > 0 ? passoFrente(cal, cur) : passoTras(cal, cur);
  }
  return cur;
}

// Fim de uma tarefa que começa em `inicio` e dura `duracao` dias úteis.
// Convenção inclusiva: tarefa de 1 dia começa e termina no mesmo dia.
// duracao=0 (marco) → fim = início (no 1º dia útil). Suporta fração (0.5).
export function fimPorDuracao(cal: Calendario, inicio: string, duracao: number): string {
  const d1 = proximoDiaUtil(cal, inicio);
  if (duracao <= EPS) return d1;
  const passos = Math.ceil(duracao - EPS) - 1;
  let cur = d1;
  for (let i = 0; i < passos; i++) cur = passoFrente(cal, cur);
  return cur;
}

// Início mais tarde de uma tarefa que TERMINA em `fim` e dura `duracao`.
export function inicioPorDuracao(cal: Calendario, fim: string, duracao: number): string {
  const dN = diaUtilAnterior(cal, fim);
  if (duracao <= EPS) return dN;
  const passos = Math.ceil(duracao - EPS) - 1;
  let cur = dN;
  for (let i = 0; i < passos; i++) cur = passoTras(cal, cur);
  return cur;
}

// Quantidade de dias úteis entre a e b (ordinal(b) - ordinal(a)).
// Positivo se b depois de a, negativo se antes, 0 se mesmo dia útil.
export function diasUteisEntre(cal: Calendario, a: string, b: string): number {
  if (a === b) return 0;
  if (a < b) {
    let cur = proximoDiaUtil(cal, a);
    let count = 0;
    while (cur < b && count < MAX_SCAN) {
      cur = passoFrente(cal, cur);
      count++;
    }
    return count;
  }
  let cur = diaUtilAnterior(cal, a);
  let count = 0;
  while (cur > b && count < MAX_SCAN) {
    cur = passoTras(cal, cur);
    count--;
  }
  return count;
}
