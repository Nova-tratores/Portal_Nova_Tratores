// PREVENTIVA da frota — função PURA (Fase 2, fatia 2, 10/10/2026).
//
// Cada item do plano (cadastrado por modelo, com a referência do manual) tem
// intervalo em km, horas de motor e/ou meses. Vence o que chegar PRIMEIRO.
//   Vencida       alguma régua passou do limite
//   Vence em breve alguma régua está dentro do aviso (padrão 1.000 km / 25 h / 30 dias)
//   Em dia        nenhuma das duas
//   Sem histórico nunca foi registrado quando foi feito → "Informar a última vez"
//   Sem leitura   tem histórico, mas falta o km/horas para calcular a régua
// Só um serviço REGISTRADO reinicia a contagem. O vencimento nunca é gravado.
//
// Modo deslizante (padrão): próximo = feito + intervalo.
// Modo fixo (marcos do manual, ex.: 10.000, 20.000, 30.000 km): próximo = o
// marco seguinte ao km em que foi feito — fazer antes não empurra o marco.

export type ModoPlano = 'deslizante' | 'fixo';

export interface ItemPlano {
  id: string;
  nome: string;
  componente_id?: string | null;
  intervalo_km: number | null;
  intervalo_horas: number | null;
  intervalo_meses: number | null;
  aviso_km?: number | null;
  aviso_horas?: number | null;
  aviso_dias?: number | null;
  modo?: ModoPlano | null;
  referencia?: string | null;
}

export interface ServicoFeito {
  data: string;            // YYYY-MM-DD
  km: number | null;
  horas_motor?: number | null;
}

export type EstadoPreventiva = 'vencida' | 'em_breve' | 'em_dia' | 'sem_leitura' | 'sem_historico';
export type Regua = 'km' | 'horas' | 'data';

export interface SituacaoPreventiva {
  estado: EstadoPreventiva;
  /** a régua que manda (a que vence primeiro) */
  regua: Regua | null;
  faltaKm: number | null;
  faltaHoras: number | null;
  faltaDias: number | null;
  proximoKm: number | null;
  proximaData: string | null;
  /** texto pronto: "faltam 480 km", "vencida há 12 dias" */
  texto: string;
  /** a régua km depende de um km velho/estimado (mostrar "?") */
  incerto: boolean;
}

export const ESTADO_LABEL: Record<EstadoPreventiva, string> = {
  vencida: 'Vencida', em_breve: 'Vence em breve', em_dia: 'Em dia',
  sem_leitura: 'Sem leitura', sem_historico: 'Sem histórico',
};

export const ESTADO_COR: Record<EstadoPreventiva, { bg: string; cor: string; forte: string }> = {
  vencida: { bg: '#fee2e2', cor: '#991b1b', forte: '#dc2626' },
  em_breve: { bg: '#fef3c7', cor: '#92400e', forte: '#f59e0b' },
  em_dia: { bg: '#dcfce7', cor: '#166534', forte: '#16a34a' },
  sem_leitura: { bg: '#e2e8f0', cor: '#475569', forte: '#94a3b8' },
  sem_historico: { bg: '#e2e8f0', cor: '#475569', forte: '#94a3b8' },
};

const PESO: Record<EstadoPreventiva, number> = { vencida: 4, em_breve: 3, em_dia: 2, sem_leitura: 1, sem_historico: 0 };
const DIA = 86400_000;
const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

export function somarMeses(dataIso: string, meses: number): string {
  const [a, m, d] = dataIso.slice(0, 10).split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

function diasEntre(deIso: string, ate: number): number {
  const de = new Date(`${deIso.slice(0, 10)}T12:00:00Z`).getTime();
  const hoje = new Date(new Date(ate).toISOString().slice(0, 10) + 'T12:00:00Z').getTime();
  return Math.round((de - hoje) / DIA);
}

export function situacaoPreventiva(
  item: ItemPlano,
  ultimo: ServicoFeito | null,
  ctx: { agora: number; kmAtual: number | null; kmIncerto?: boolean; horasDesdeUltimo: number | null },
): SituacaoPreventiva {
  const vazio = { faltaKm: null, faltaHoras: null, faltaDias: null, proximoKm: null, proximaData: null, incerto: false };
  if (!ultimo) return { estado: 'sem_historico', regua: null, texto: 'Informar a última vez', ...vazio };

  type Dim = { regua: Regua; estado: EstadoPreventiva; falta: number; razao: number };
  const dims: Dim[] = [];
  const classificar = (falta: number, aviso: number): EstadoPreventiva => (falta <= 0 ? 'vencida' : falta <= aviso ? 'em_breve' : 'em_dia');

  let proximoKm: number | null = null;
  let faltaKm: number | null = null;
  if (item.intervalo_km && ultimo.km != null && ctx.kmAtual != null) {
    proximoKm = item.modo === 'fixo'
      ? (Math.floor(ultimo.km / item.intervalo_km) + 1) * item.intervalo_km
      : ultimo.km + item.intervalo_km;
    faltaKm = proximoKm - ctx.kmAtual;
    dims.push({ regua: 'km', estado: classificar(faltaKm, item.aviso_km ?? 1000), falta: faltaKm, razao: faltaKm / item.intervalo_km });
  }
  let faltaHoras: number | null = null;
  if (item.intervalo_horas && ctx.horasDesdeUltimo != null) {
    faltaHoras = item.intervalo_horas - ctx.horasDesdeUltimo;
    dims.push({ regua: 'horas', estado: classificar(faltaHoras, item.aviso_horas ?? 25), falta: faltaHoras, razao: faltaHoras / item.intervalo_horas });
  }
  let proximaData: string | null = null;
  let faltaDias: number | null = null;
  if (item.intervalo_meses) {
    proximaData = somarMeses(ultimo.data, item.intervalo_meses);
    faltaDias = diasEntre(proximaData, ctx.agora);
    dims.push({ regua: 'data', estado: classificar(faltaDias, item.aviso_dias ?? 30), falta: faltaDias, razao: faltaDias / (item.intervalo_meses * 30) });
  }

  if (!dims.length) {
    return {
      estado: 'sem_leitura', regua: null, texto: ultimo.km == null && item.intervalo_km ? 'Falta o km da última vez' : 'Falta o km do carro',
      faltaKm, faltaHoras, faltaDias, proximoKm, proximaData, incerto: true,
    };
  }
  // a pior régua manda; empate no estado → a que tem menos folga relativa
  dims.sort((a, b) => (PESO[b.estado] - PESO[a.estado]) || (a.razao - b.razao));
  const d = dims[0];
  const incerto = d.regua === 'km' && !!ctx.kmIncerto;
  const unidade = d.regua === 'km' ? 'km' : d.regua === 'horas' ? 'h' : (Math.abs(d.falta) === 1 ? 'dia' : 'dias');
  const texto = d.estado === 'vencida'
    ? (d.falta === 0 ? `vence hoje${d.regua !== 'data' ? ` (${unidade})` : ''}` : `vencida há ${fmt(-d.falta)} ${unidade}`)
    : `faltam ${fmt(d.falta)} ${unidade}`;
  return { estado: d.estado, regua: d.regua, faltaKm, faltaHoras, faltaDias, proximoKm, proximaData, texto: incerto ? `${texto} ?` : texto, incerto };
}

export interface ResumoPreventivas {
  vencida: number; em_breve: number; em_dia: number; sem_leitura: number; sem_historico: number;
  /** (em dia + em breve) ÷ itens com régua calculada; null quando não há nenhum */
  pctEmDia: number | null;
}

export function resumirPreventivas(estados: EstadoPreventiva[]): ResumoPreventivas {
  const r = { vencida: 0, em_breve: 0, em_dia: 0, sem_leitura: 0, sem_historico: 0 };
  for (const e of estados) r[e]++;
  const base = r.vencida + r.em_breve + r.em_dia;
  return { ...r, pctEmDia: base ? Math.round(((r.em_dia + r.em_breve) / base) * 100) : null };
}

/** Gravidade da pendência que a preventiva abre: em breve = leve; vencida = média; muito passada = grave. */
export function gravidadePreventiva(item: ItemPlano, s: SituacaoPreventiva): 'leve' | 'media' | 'grave' | null {
  if (s.estado === 'em_breve') return 'leve';
  if (s.estado !== 'vencida') return null;
  const intervalo = s.regua === 'km' ? item.intervalo_km : s.regua === 'horas' ? item.intervalo_horas : (item.intervalo_meses || 0) * 30;
  const passou = s.regua === 'km' ? -(s.faltaKm ?? 0) : s.regua === 'horas' ? -(s.faltaHoras ?? 0) : -(s.faltaDias ?? 0);
  return intervalo && passou > intervalo * 0.2 ? 'grave' : 'media';
}

export const precisaAtencao = (e: EstadoPreventiva) => e === 'vencida' || e === 'em_breve';
