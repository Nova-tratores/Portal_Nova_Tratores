// Regras PURAS da vista "Semanas" do histórico do Dashboard de Vendas.
//
// Semana = segunda a domingo (mesma régua do date_trunc('week') do Postgres,
// usado nas RPCs semanais). Uma linha por semana, da mais recente para a mais
// antiga, desde a 1ª semana com valor > 0 (antes disso é "sem dados", não zero;
// depois dela, semana sem venda vale 0).
//   Δ sem. ant. = vs a semana imediatamente anterior;
//   Δ ano ant.  = vs a MESMA semana ISO (nº 1..53) do ano ISO anterior;
//   semana corrente é parcial → sem Δ; base pequena marcada (a tela pinta de cinza).
// Datas em texto 'YYYY-MM-DD', sempre lidas no fuso local (sem UTC).

import { delta, valorDaMetrica, type Delta, type Metrica } from './historico-grade';

export interface PontoSemana {
  /** Segunda-feira da semana, 'YYYY-MM-DD'. */
  inicio: string;
  valor: number;
  custo: number;
}

export interface LinhaSemana {
  inicio: string;
  fim: string;
  /** '06/10–12/10' */
  rotulo: string;
  anoIso: number;
  semanaIso: number;
  valor: number;
  parcial: boolean;
  deltaAnt: Delta | null;
  deltaAno: Delta | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoData = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function lerIso(s: string): Date {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
}
const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Segunda-feira da semana de `d` (ou da data 'YYYY-MM-DD'). */
export function inicioSemana(d: Date | string): string {
  const x = typeof d === 'string' ? lerIso(d) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0 = domingo
  return isoData(somarDias(x, dow === 0 ? -6 : 1 - dow));
}

/** Ano e número da semana ISO-8601 (a semana é do ano da sua quinta-feira). */
export function semanaIso(inicio: string): { ano: number; semana: number } {
  const quinta = somarDias(lerIso(inicioSemana(inicio)), 3);
  const ano = quinta.getFullYear();
  const primeiraQuinta = somarDias(lerIso(inicioSemana(new Date(ano, 0, 4))), 3);
  return { ano, semana: 1 + Math.round((quinta.getTime() - primeiraQuinta.getTime()) / (7 * 864e5)) };
}

export function montarSemanas(
  pontos: PontoSemana[],
  opts: { metrica: Metrica; hoje: Date; baseMin: number },
): LinhaSemana[] {
  const { metrica, hoje, baseMin } = opts;
  const atual = inicioSemana(hoje);
  const porInicio = new Map<string, number>();
  for (const p of pontos) {
    const k = inicioSemana(p.inicio);
    porInicio.set(k, (porInicio.get(k) ?? 0) + valorDaMetrica(p, metrica));
  }
  const comDado = pontos.filter((p) => p.valor > 0).map((p) => inicioSemana(p.inicio)).sort();
  if (comDado.length === 0) return [];
  const primeira = comDado[0];

  // Todas as semanas de `primeira` até a atual (0 onde não houve movimento).
  const semanas: string[] = [];
  for (let d = lerIso(primeira); isoData(d) <= atual; d = somarDias(d, 7)) semanas.push(isoData(d));
  const valorDe = (inicio: string): number | null => (inicio < primeira || inicio > atual ? null : porInicio.get(inicio) ?? 0);
  const porSemanaIso = new Map<string, string>();
  for (const s of semanas) { const w = semanaIso(s); porSemanaIso.set(w.ano + '-' + w.semana, s); }

  const fmt = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return semanas.reverse().map((inicio) => {
    const ini = lerIso(inicio);
    const fim = somarDias(ini, 6);
    const w = semanaIso(inicio);
    const parcial = inicio === atual;
    const valor = valorDe(inicio) ?? 0;
    const anterior = isoData(somarDias(ini, -7));
    const mesmaAnoAnt = porSemanaIso.get((w.ano - 1) + '-' + w.semana) ?? null;
    return {
      inicio,
      fim: isoData(fim),
      rotulo: `${fmt(ini)}–${fmt(fim)}`,
      anoIso: w.ano,
      semanaIso: w.semana,
      valor,
      parcial,
      deltaAnt: parcial ? null : delta(valor, valorDe(anterior), baseMin),
      deltaAno: parcial || !mesmaAnoAnt ? null : delta(valor, valorDe(mesmaAnoAnt), baseMin),
    };
  });
}

/** Soma valores diários ('YYYY-MM-DD') por semana (segunda) ou por mês. */
export function agruparDias<K extends string>(
  dias: Array<{ data: string } & Record<K, number>>,
  campos: K[],
  por: 'semana' | 'mes',
): Array<{ chave: string } & Record<K, number>> {
  const mapa = new Map<string, Record<K, number>>();
  for (const d of dias) {
    const chave = por === 'semana' ? inicioSemana(d.data) : d.data.slice(0, 7);
    let acc = mapa.get(chave);
    if (!acc) { acc = Object.fromEntries(campos.map((c) => [c, 0])) as Record<K, number>; mapa.set(chave, acc); }
    for (const c of campos) acc[c] += d[c] || 0;
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([chave, v]) => ({ chave, ...v }));
}

// ====================== Comparações prontas entre semanas ======================
// Só com semanas FECHADAS (a corrente é parcial e distorceria). "Ano passado" =
// as mesmas semanas ISO (nº) do ano anterior; se alguma não existir na série, o
// resultado sai marcado como incompleto e sem Δ.

export type PresetSemanas = 'ultima_anterior' | 'ultima_ano' | 'ult4_ant4' | 'ult4_ano' | 'ult13_ano' | 'escolher';

export const PRESETS_SEMANAS: Array<{ id: PresetSemanas; rotulo: string }> = [
  { id: 'ultima_anterior', rotulo: 'Última semana × anterior' },
  { id: 'ultima_ano', rotulo: 'Última semana × mesma do ano passado' },
  { id: 'ult4_ant4', rotulo: 'Últimas 4 × 4 anteriores' },
  { id: 'ult4_ano', rotulo: 'Últimas 4 × mesmas 4 do ano passado' },
  { id: 'ult13_ano', rotulo: 'Últimas 13 (trimestre) × mesmas do ano passado' },
  { id: 'escolher', rotulo: 'Escolher duas semanas' },
];

export interface PeriodoSemanas {
  rotulo: string;
  /** Inícios (segunda-feira) das semanas do período. */
  inicios: string[];
}

/** Rótulo de um período: 1 semana → "sem. 40 · 28/09–04/10/26"; várias → "07/09–04/10/26 (4 sem.)". */
export function rotuloPeriodo(inicios: string[]): string {
  if (inicios.length === 0) return '—';
  const ord = [...inicios].sort();
  const ini = lerIso(ord[0]);
  const fim = somarDias(lerIso(ord[ord.length - 1]), 6);
  const f = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  const faixa = `${f(ini)}–${f(fim)}/${String(fim.getFullYear()).slice(2)}`;
  return ord.length === 1 ? `sem. ${semanaIso(ord[0]).semana} · ${faixa}` : `${faixa} (${ord.length} sem.)`;
}

/** As semanas ISO do ano anterior que correspondem a `inicios` (null quando alguma não existe). */
function mesmasDoAnoPassado(inicios: string[]): string[] | null {
  const out: string[] = [];
  for (const i of inicios) {
    const w = semanaIso(i);
    // Semana nº w.semana do ano w.ano-1: parte da 1ª segunda-feira ISO daquele ano.
    const primeira = lerIso(inicioSemana(new Date(w.ano - 1, 0, 4)));
    const alvo = somarDias(primeira, (w.semana - 1) * 7);
    if (semanaIso(isoData(alvo)).ano !== w.ano - 1) return null; // semana 53 sem par
    out.push(isoData(alvo));
  }
  return out;
}

/**
 * Os dois períodos de uma comparação pronta. `fechadas` = inícios das semanas
 * FECHADAS, mais recente primeiro. `escolhidas` só no preset "escolher".
 */
export function periodosDaComparacao(
  preset: PresetSemanas,
  fechadas: string[],
  escolhidas?: { a: string; b: string },
): { a: PeriodoSemanas; b: PeriodoSemanas } | null {
  const per = (inicios: string[]): PeriodoSemanas => ({ rotulo: rotuloPeriodo(inicios), inicios });
  if (preset === 'escolher') {
    if (!escolhidas?.a || !escolhidas?.b) return null;
    return { a: per([escolhidas.a]), b: per([escolhidas.b]) };
  }
  const n = preset === 'ult13_ano' ? 13 : preset === 'ult4_ant4' || preset === 'ult4_ano' ? 4 : 1;
  const a = fechadas.slice(0, n);
  if (a.length < n) return null;
  if (preset === 'ultima_anterior' || preset === 'ult4_ant4') {
    const b = fechadas.slice(n, 2 * n);
    return b.length < n ? null : { a: per(a), b: per(b) };
  }
  const b = mesmasDoAnoPassado(a);
  return b ? { a: per(a), b: per(b) } : null;
}

/** Soma uma série semanal nos inícios dados; `faltando` = semanas sem dado (antes do início da série). */
export function somarSemanas(linhas: LinhaSemana[], inicios: string[]): { valor: number; faltando: number } {
  const porInicio = new Map(linhas.map((l) => [l.inicio, l.valor]));
  let valor = 0, faltando = 0;
  for (const i of inicios) {
    const v = porInicio.get(i);
    if (v == null) faltando++; else valor += v;
  }
  return { valor, faltando };
}
