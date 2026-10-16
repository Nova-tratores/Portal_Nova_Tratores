// Ranking de uso da frota: km rodados e horas de motor ligado por veículo ou
// por motorista, num período, com quebra por dia, semana ou mês (puro —
// testado em __tests__/ranking-uso.test.ts).
//
// Fonte: frota_dias (um registro por carro por dia, gravado pelo fechar-dia às
// 04:20 BRT). Por isso o dia de HOJE nunca entra: o último dia é ontem.
import { chaveNome, limparNome } from './mapa-vivo';

export interface DiaUso {
  veiculo_id: string;
  placa: string;
  modelo: string | null;
  data: string;                 // YYYY-MM-DD
  motorista_nome: string | null;
  km: number;                   // km_odometro ?? km_total
  ligado_min: number;
  movimento_min: number;
  lenta_min: number;
}

export type AgruparPor = 'veiculo' | 'motorista';
export type Quebra = 'total' | 'dia' | 'semana' | 'mes';
export type Metrica = 'km' | 'ligado' | 'lenta' | 'dias';

export const METRICA_INFO: Record<Metrica, { label: string; curto: string }> = {
  km: { label: 'Km rodados', curto: 'Km' },
  ligado: { label: 'Horas ligado', curto: 'Ligado' },
  lenta: { label: 'Marcha lenta', curto: 'M. lenta' },
  dias: { label: 'Dias usados', curto: 'Dias' },
};

export interface Totais { km: number; ligado: number; movimento: number; lenta: number; dias: number }

export interface LinhaRanking extends Totais {
  chave: string;
  nome: string;           // placa (veículo) ou nome (motorista)
  detalhe: string;        // modelo + motorista mais frequente | placas usadas
  porBalde: Record<string, Totais>;
}

const vazio = (): Totais => ({ km: 0, ligado: 0, movimento: 0, lenta: 0, dias: 0 });

/** Dia usado = rodou ou ligou o motor. Carro parado o dia inteiro não conta. */
export const diaUsado = (d: DiaUso) => d.km > 0 || d.ligado_min > 0;

// ── datas (strings YYYY-MM-DD, sem fuso: as contas são em UTC puro) ─────────
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);
export const somaDias = (s: string, n: number) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };

/** Segunda-feira da semana do dia. */
export function inicioSemana(s: string): string {
  const dow = toDate(s).getUTCDay(); // 0 = domingo
  return somaDias(s, -((dow + 6) % 7));
}

export function chaveBalde(data: string, q: Quebra): string {
  if (q === 'dia') return data;
  if (q === 'semana') return inicioSemana(data);
  if (q === 'mes') return data.slice(0, 7);
  return 'total';
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function rotuloBalde(chave: string, q: Quebra): string {
  if (q === 'mes') return `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
  if (q === 'dia') return `${DIAS_SEM[toDate(chave).getUTCDay()]} ${chave.slice(8, 10)}/${chave.slice(5, 7)}`;
  if (q === 'semana') {
    const fim = somaDias(chave, 6);
    return `${chave.slice(8, 10)}/${chave.slice(5, 7)}–${fim.slice(8, 10)}/${fim.slice(5, 7)}`;
  }
  return 'Total';
}

/** Todos os baldes entre de e até (inclusive), na ordem — inclusive os vazios. */
export function baldesDoPeriodo(de: string, ate: string, q: Quebra): string[] {
  if (q === 'total' || de > ate) return [];
  const out: string[] = [];
  let atual = chaveBalde(de, q);
  const ultimo = chaveBalde(ate, q);
  while (atual <= ultimo && out.length < 400) {
    out.push(atual);
    if (q === 'dia') atual = somaDias(atual, 1);
    else if (q === 'semana') atual = somaDias(atual, 7);
    else {
      const [a, m] = atual.split('-').map(Number);
      atual = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
    }
  }
  return out;
}

// ── períodos prontos ─────────────────────────────────────────────────────────
export type Preset = 'ontem' | 'semana' | 'semana_passada' | 'mes' | 'mes_passado' | '30d' | 'ano' | 'periodo';

export const PRESETS: { id: Preset; label: string }[] = [
  { id: 'ontem', label: 'Ontem' },
  { id: 'semana', label: 'Esta semana' },
  { id: 'semana_passada', label: 'Semana passada' },
  { id: 'mes', label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: '30d', label: 'Últimos 30 dias' },
  { id: 'ano', label: 'Este ano' },
  { id: 'periodo', label: 'Período…' },
];

/** Período do preset a partir de HOJE (YYYY-MM-DD no fuso de SP). O último
 *  dia com dados é ontem; "esta semana" numa segunda vira só… nenhum dia, então
 *  cai na semana passada inteira. */
export function periodoDoPreset(p: Preset, hoje: string): { de: string; ate: string } {
  const ontem = somaDias(hoje, -1);
  switch (p) {
    case 'ontem': return { de: ontem, ate: ontem };
    case 'semana': {
      const ini = inicioSemana(hoje);
      return ini > ontem ? periodoDoPreset('semana_passada', hoje) : { de: ini, ate: ontem };
    }
    case 'semana_passada': {
      const ini = somaDias(inicioSemana(hoje), -7);
      return { de: ini, ate: somaDias(ini, 6) };
    }
    case 'mes': {
      const ini = `${hoje.slice(0, 7)}-01`;
      return ini > ontem ? periodoDoPreset('mes_passado', hoje) : { de: ini, ate: ontem };
    }
    case 'mes_passado': {
      const fim = somaDias(`${hoje.slice(0, 7)}-01`, -1);
      return { de: `${fim.slice(0, 7)}-01`, ate: fim };
    }
    case 'ano': return { de: `${hoje.slice(0, 4)}-01-01`, ate: ontem };
    case '30d':
    default: return { de: somaDias(ontem, -29), ate: ontem };
  }
}

/** Quebra que faz sentido para o tamanho do período (dia até 31 dias, semana até ~4 meses). */
export function quebraSugerida(de: string, ate: string): Quebra {
  const dias = (toDate(ate).getTime() - toDate(de).getTime()) / 86400_000 + 1;
  if (dias <= 1) return 'total';
  if (dias <= 31) return 'dia';
  if (dias <= 120) return 'semana';
  return 'mes';
}

// ── agregação ────────────────────────────────────────────────────────────────
function somar(t: Totais, d: DiaUso) {
  t.km += d.km;
  t.ligado += d.ligado_min;
  t.movimento += d.movimento_min;
  t.lenta += d.lenta_min;
  t.dias += 1;
}

export function valor(t: Totais, m: Metrica): number {
  return m === 'km' ? t.km : m === 'ligado' ? t.ligado : m === 'lenta' ? t.lenta : t.dias;
}

const maisFrequente = (cont: Map<string, { nome: string; n: number }>) =>
  [...cont.values()].sort((a, b) => b.n - a.n).map((x) => x.nome);

/** Monta o ranking. Só entram dias usados. Motorista sem nome vira "Sem motorista". */
export function montarRanking(dias: DiaUso[], por: AgruparPor, quebra: Quebra, metrica: Metrica): LinhaRanking[] {
  const linhas = new Map<string, LinhaRanking & { _cont: Map<string, { nome: string; n: number }> }>();
  for (const d of dias) {
    if (!diaUsado(d)) continue;
    const motorista = limparNome(d.motorista_nome);
    let chave: string, nome: string, outro: string;
    if (por === 'veiculo') {
      chave = d.veiculo_id;
      nome = d.placa;
      outro = motorista || '';
    } else {
      chave = motorista ? chaveNome(motorista) : '__sem__';
      nome = motorista || 'Sem motorista';
      outro = d.placa;
    }
    let l = linhas.get(chave);
    if (!l) {
      l = { chave, nome, detalhe: '', porBalde: {}, ...vazio(), _cont: new Map() };
      if (por === 'veiculo') l.detalhe = d.modelo || '';
      linhas.set(chave, l);
    }
    somar(l, d);
    if (quebra !== 'total') {
      const b = chaveBalde(d.data, quebra);
      somar((l.porBalde[b] ||= vazio()), d);
    }
    if (outro) {
      const k = chaveNome(outro);
      const c = l._cont.get(k) || { nome: outro, n: 0 };
      c.n += 1;
      l._cont.set(k, c);
    }
  }
  const out: LinhaRanking[] = [];
  for (const { _cont, ...l } of linhas.values()) {
    const nomes = maisFrequente(_cont);
    if (por === 'veiculo') l.detalhe = [l.detalhe, nomes.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
    else l.detalhe = nomes.join(', ');
    l.km = Math.round(l.km * 10) / 10;
    out.push(l);
  }
  return out.sort((a, b) => valor(b, metrica) - valor(a, metrica) || b.km - a.km || a.nome.localeCompare(b.nome));
}

export function totalGeral(linhas: LinhaRanking[]): Totais {
  const t = vazio();
  for (const l of linhas) { t.km += l.km; t.ligado += l.ligado; t.movimento += l.movimento; t.lenta += l.lenta; t.dias += l.dias; }
  return t;
}

/** "5h07" · "45 min" (minutos inteiros). */
export function fmtHoras(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

export const fmtKm = (km: number) => `${Math.round(km).toLocaleString('pt-BR')} km`;

export function fmtValor(t: Totais | undefined, m: Metrica): string {
  if (!t) return '';
  const v = valor(t, m);
  if (!v) return '';
  return m === 'km' ? Math.round(v).toLocaleString('pt-BR') : m === 'dias' ? String(v) : fmtHoras(v);
}

/** CSV (separador ;) com totais e, se houver quebra, a métrica escolhida por balde. */
export function csvRanking(linhas: LinhaRanking[], por: AgruparPor, quebra: Quebra, metrica: Metrica, baldes: string[]): string {
  const esc = (s: string | number) => {
    const t = String(s);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const num = (n: number, casas = 1) => n.toFixed(casas).replace('.', ',');
  const cab = ['Posição', por === 'veiculo' ? 'Placa' : 'Motorista', por === 'veiculo' ? 'Modelo / motoristas' : 'Placas',
    'Dias usados', 'Km', 'Horas ligado', 'Horas em movimento', 'Horas marcha lenta', 'Km por dia',
    ...(quebra === 'total' ? [] : baldes.map((b) => `${METRICA_INFO[metrica].curto} ${rotuloBalde(b, quebra)}`))];
  const corpo = linhas.map((l, i) => [
    i + 1, l.nome, l.detalhe, l.dias, num(l.km), num(l.ligado / 60), num(l.movimento / 60), num(l.lenta / 60),
    num(l.dias ? l.km / l.dias : 0),
    ...(quebra === 'total' ? [] : baldes.map((b) => {
      const t = l.porBalde[b];
      if (!t) return '';
      return metrica === 'km' ? num(t.km) : metrica === 'dias' ? t.dias : num(valor(t, metrica) / 60);
    })),
  ].map(esc).join(';'));
  return [cab.map(esc).join(';'), ...corpo].join('\n');
}
