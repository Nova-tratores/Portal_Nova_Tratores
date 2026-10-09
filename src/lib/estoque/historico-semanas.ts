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
