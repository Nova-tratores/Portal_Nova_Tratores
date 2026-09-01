// Motor de cálculo da sugestão de compra de peças — FUNÇÃO PURA.
//
// Sem I/O: recebe séries (das views), parâmetros e a classe ABC já prontos e
// devolve a sugestão + a "memória de cálculo" (cada número intermediário
// nomeado). É o que alimenta o painel de detalhe e o que torna erro invisível
// em erro auditável. Unit-testável com fixtures (motor.test.ts).
//
// Fluxo: analisarConta() roda 1× por conta (NOVA, CASTRO) e produz demanda/
// sigma/estoque; consolidar() junta as duas por SKU, faz o pooling do estoque
// de segurança e produz a quantidade a comprar. Ver plano em
// C:\Users\hhenr\.claude\plans\siga-snoopy-clarke.md.

// ===================== Tipos de entrada =====================

/** Uma linha de saída mensal já com a base para a correção de censura. */
export interface MesSaida {
  ano: number;
  mes: number; // 1..12
  demanda: number; // -Σqtde_saida de VEN naquele mês (>= 0)
  diasNoMes: number;
  diasComSaldoPositivo: number; // dias do mês com estoque > 0 (calculado no job)
}

/** Índice sazonal por mês-do-calendário (1..12). Já resolvido (=1 se não aplicável). */
export type IndiceSazonal = Record<number, number>;

export type Curva = 'A' | 'B' | 'C';
export type Frequencia = 'alta' | 'media' | 'baixa';
export type Regime = 'estatistico' | 'intermitente' | 'sem_historico';

export interface ParamsConta {
  multiploEmbalagem: number; // default 1
  minimoManual?: number | null;
  minimoManualValidade?: string | null; // ISO date; vencido = ignora
  critico: boolean; // força nível de serviço 98%
  sobEncomenda: boolean; // nunca entra na sugestão
  leadTimeUsado: number; // dias (override, realizado ou declarado)
  leadTimeOrigem: 'declarado' | 'medido';
  sigmaLead: number; // desvio do lead time (dias)
  cicloDias: number; // 15 na fábrica principal
  regularidade: 'regular' | 'irregular' | 'muito_irregular';
  nivelServicoOverride?: number | null; // 0..1
}

export interface EntradaConta {
  serie12m: MesSaida[]; // últimos 12 meses (pode ter buracos)
  estoqueAtual: number;
  emTransito: number;
}

// ===================== Saída =====================

export interface LinhaMemoria {
  rotulo: string;
  valor: number | string;
  origem?: string;
}

export interface SaidaConta {
  cmdDiario: number; // consumo médio diário dessazonalizado (ajustado de censura)
  sigmaDemanda: number; // desvio da demanda mensal ajustada
  demanda45d: number;
  prev30: number;
  prev60: number;
  prev90: number;
  mesesComSaida: number;
  diasRuptura12m: number;
  fatorCensuraMedio: number;
  estoqueAtual: number;
  emTransito: number;
  serieAjustada: number[]; // demanda mensal ajustada (para pooling)
}

export interface ResultadoConsolidado {
  frequencia: Frequencia;
  regime: Regime;
  mesesComSaida: number; // meses (0..12) com saída na série poolada
  curva: Curva;
  nivelServico: number;
  z: number;
  cmd: number; // diário consolidado (pool)
  sigmaDemanda: number; // pool
  demanda45d: number; // consolidada
  revisoes45d: number; // sempre 0 na v1
  estoqueSeguranca: number;
  minimoEfetivo: number;
  minimoOrigem: 'calculado' | 'manual';
  estoqueAtual: number; // pool
  emTransito: number; // pool
  prev30: number;
  prev60: number;
  prev90: number;
  qtdSugeridaBruta: number;
  qtdSugerida: number; // arredondada ao múltiplo
  alerta: 'ja_era' | 'critico' | 'atencao' | 'ok' | 'nao_comprar';
  memoria: LinhaMemoria[];
}

// ===================== Constantes =====================

const CENSURA_TETO = 2; // fator de correção limitado a 2×
const JANELA_PADRAO = 45; // lead time (30) + ciclo (15)

// Matriz nível de serviço por curva × frequência (freq. baixa = intermitente, sem NS).
const MATRIZ_NS: Record<Curva, Record<'alta' | 'media', number>> = {
  A: { alta: 0.97, media: 0.95 },
  B: { alta: 0.95, media: 0.92 },
  C: { alta: 0.95, media: 0.88 },
};
const NS_CRITICO = 0.98;

// ===================== Utilidades estatísticas =====================

/** Inversa da normal padrão (Acklam). z tal que Φ(z) = p, p ∈ (0,1). */
export function invNormal(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function desvioPadrao(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/** Correção de censura: mês zerado registra venda perdida, não falta de procura. */
export function corrigirCensura(m: MesSaida): { ajustada: number; fator: number } {
  const dias = m.diasComSaldoPositivo > 0 ? m.diasComSaldoPositivo : m.diasNoMes;
  const fator = Math.min(CENSURA_TETO, m.diasNoMes / Math.max(1, dias));
  return { ajustada: m.demanda * fator, fator };
}

/** Soma da demanda numa janela de N dias a partir de hoje, com índice sazonal pró-rata por dia. */
export function demandaJanela(nivelDiario: number, indice: IndiceSazonal, hoje: Date, dias: number): number {
  let total = 0;
  for (let i = 0; i < dias; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i);
    const idx = indice[d.getMonth() + 1] ?? 1;
    total += nivelDiario * idx;
  }
  return total;
}

// ===================== Motor por conta =====================

export function analisarConta(entrada: EntradaConta, indice: IndiceSazonal, hoje: Date = new Date()): SaidaConta {
  const serie = entrada.serie12m;
  const ajustadas: number[] = [];
  let somaFator = 0;
  let mesesComSaida = 0;
  let diasRuptura = 0;
  for (const m of serie) {
    const { ajustada, fator } = corrigirCensura(m);
    ajustadas.push(ajustada);
    somaFator += fator;
    if (m.demanda > 0) mesesComSaida++;
    diasRuptura += Math.max(0, m.diasNoMes - m.diasComSaldoPositivo);
  }
  const somaAjustada = ajustadas.reduce((a, b) => a + b, 0);
  const nivelDiario = somaAjustada / 365;
  const sigmaMensal = desvioPadrao(ajustadas);

  return {
    cmdDiario: nivelDiario,
    sigmaDemanda: sigmaMensal,
    demanda45d: demandaJanela(nivelDiario, indice, hoje, JANELA_PADRAO),
    prev30: demandaJanela(nivelDiario, indice, hoje, 30),
    prev60: demandaJanela(nivelDiario, indice, hoje, 60),
    prev90: demandaJanela(nivelDiario, indice, hoje, 90),
    mesesComSaida,
    diasRuptura12m: diasRuptura,
    fatorCensuraMedio: serie.length ? somaFator / serie.length : 1,
    estoqueAtual: entrada.estoqueAtual,
    emTransito: entrada.emTransito,
    serieAjustada: ajustadas,
  };
}

// ===================== Classificação =====================

export function classificarFrequencia(mesesComSaida: number): { frequencia: Frequencia; regime: Regime } {
  if (mesesComSaida >= 9) return { frequencia: 'alta', regime: 'estatistico' };
  if (mesesComSaida >= 4) return { frequencia: 'media', regime: 'estatistico' };
  if (mesesComSaida >= 1) return { frequencia: 'baixa', regime: 'intermitente' };
  return { frequencia: 'baixa', regime: 'sem_historico' };
}

export function nivelDeServico(curva: Curva, freq: Frequencia, critico: boolean, override?: number | null): number {
  if (critico) return NS_CRITICO;
  if (override != null) return override;
  if (freq === 'baixa') return 0; // intermitente: sem colchão estatístico
  return MATRIZ_NS[curva][freq];
}

// ===================== Consolidação NOVA + CASTRO =====================

export interface ArgsConsolidar {
  nova?: SaidaConta;
  castro?: SaidaConta;
  curva: Curva; // classe consolidada (melhor entre as contas)
  params: ParamsConta; // do fornecedor/item preferencial (conta líder)
  hoje?: Date;
}

/** Arredonda para cima ao múltiplo de embalagem. */
export function arredondarMultiplo(q: number, multiplo: number): number {
  if (multiplo <= 1) return Math.ceil(q);
  return Math.ceil(q / multiplo) * multiplo;
}

function minimoManualValido(p: ParamsConta, hoje: Date): boolean {
  if (p.minimoManual == null) return false;
  if (!p.minimoManualValidade) return false;
  return new Date(p.minimoManualValidade) >= hoje;
}

export function consolidar({ nova, castro, curva, params, hoje = new Date() }: ArgsConsolidar): ResultadoConsolidado {
  const contas = [nova, castro].filter((c): c is SaidaConta => !!c);
  const mem: LinhaMemoria[] = [];

  // Demanda/estoque consolidados (pool)
  const demanda45d = contas.reduce((a, c) => a + c.demanda45d, 0);
  const prev30 = contas.reduce((a, c) => a + c.prev30, 0);
  const prev60 = contas.reduce((a, c) => a + c.prev60, 0);
  const prev90 = contas.reduce((a, c) => a + c.prev90, 0);
  const estoqueAtual = contas.reduce((a, c) => a + c.estoqueAtual, 0);
  const emTransito = contas.reduce((a, c) => a + c.emTransito, 0);
  const cmd = contas.reduce((a, c) => a + c.cmdDiario, 0);

  // Frequência/regime sobre a série mensal POOLADA (soma mês a mês)
  const nMeses = Math.max(...contas.map((c) => c.serieAjustada.length), 0);
  const seriePool: number[] = [];
  for (let i = 0; i < nMeses; i++) {
    seriePool.push(contas.reduce((a, c) => a + (c.serieAjustada[i] ?? 0), 0));
  }
  const mesesComSaidaPool = seriePool.filter((x) => x > 0).length;
  const { frequencia, regime } = classificarFrequencia(mesesComSaidaPool);

  // Sigma da demanda poolada: √(Σ σ_conta²) (menor que a soma dos σ)
  const sigmaDemanda = Math.sqrt(contas.reduce((a, c) => a + c.sigmaDemanda ** 2, 0));

  mem.push({ rotulo: 'demanda 45d (consolidada)', valor: round2(demanda45d) });
  mem.push({ rotulo: 'estoque atual (pool)', valor: round2(estoqueAtual) });
  mem.push({ rotulo: 'em trânsito (pool)', valor: round2(emTransito) });
  mem.push({ rotulo: 'curva', valor: curva, origem: 'faturamento (melhor entre contas)' });
  mem.push({ rotulo: 'frequência', valor: `${frequencia} (${mesesComSaidaPool}/12 meses)` });
  mem.push({ rotulo: 'regime', valor: regime });

  const ns = nivelDeServico(curva, frequencia, params.critico, params.nivelServicoOverride);
  const z = ns > 0 ? invNormal(ns) : 0;
  mem.push({ rotulo: 'nível de serviço', valor: ns, origem: params.critico ? 'crítico=98%' : (params.nivelServicoOverride != null ? 'override' : `matriz ${curva}/${frequencia}`) });
  mem.push({ rotulo: 'Z', valor: round2(z) });

  // Estoque de segurança poolado.
  // SS = z·√(LT·σ_dem² + dem_diária²·σ_LT²)   [σ_dem aqui é mensal → convertido a diário]
  const sigmaDemDiaria = sigmaDemanda / Math.sqrt(30.4);
  const LT = params.leadTimeUsado;
  const ssCalc = regime === 'estatistico'
    ? z * Math.sqrt(LT * sigmaDemDiaria ** 2 + cmd ** 2 * params.sigmaLead ** 2)
    : 0;
  mem.push({ rotulo: 'lead time usado', valor: LT, origem: params.leadTimeOrigem });
  mem.push({ rotulo: 'σ lead', valor: round2(params.sigmaLead), origem: params.leadTimeOrigem === 'medido' ? 'medido' : `regularidade=${params.regularidade}` });

  // Mínimo efetivo: manual válido sobrepõe o SS calculado.
  let minimoEfetivo = ssCalc;
  let minimoOrigem: 'calculado' | 'manual' = 'calculado';
  if (minimoManualValido(params, hoje)) {
    minimoEfetivo = params.minimoManual as number;
    minimoOrigem = 'manual';
    mem.push({ rotulo: 'mínimo manual (sobrepõe SS)', valor: round2(minimoEfetivo), origem: 'config' });
  } else {
    mem.push({ rotulo: 'estoque de segurança', valor: round2(ssCalc), origem: regime });
  }

  // Sugestão.
  let alerta: ResultadoConsolidado['alerta'];
  let qtdBruta: number;
  if (params.sobEncomenda) {
    qtdBruta = 0;
    alerta = 'nao_comprar';
    mem.push({ rotulo: 'sob encomenda', valor: 'não entra na sugestão' });
  } else if (regime === 'sem_historico' && minimoOrigem !== 'manual') {
    qtdBruta = 0;
    alerta = 'nao_comprar';
    mem.push({ rotulo: 'sem histórico', valor: 'fora da sugestão (v1 sem camada de revisões)' });
  } else {
    const alvo = demanda45d + minimoEfetivo; // revisoes_45d = 0 na v1
    qtdBruta = Math.max(0, alvo - estoqueAtual - emTransito);
    mem.push({ rotulo: 'alvo (demanda45d + mínimo)', valor: round2(alvo) });
    mem.push({ rotulo: 'sugerida bruta = alvo − estoque − trânsito', valor: round2(qtdBruta) });
    alerta = classificarAlerta({ estoqueAtual, emTransito, cmd, leadTime: LT, janela: JANELA_PADRAO, minimoEfetivo, qtdBruta });
  }

  const qtdSugerida = arredondarMultiplo(qtdBruta, params.multiploEmbalagem);
  if (params.multiploEmbalagem > 1) {
    mem.push({ rotulo: `arredondada ao múltiplo (${params.multiploEmbalagem})`, valor: qtdSugerida });
  }

  return {
    frequencia, regime, mesesComSaida: mesesComSaidaPool, curva, nivelServico: ns, z,
    cmd, sigmaDemanda, demanda45d, revisoes45d: 0,
    estoqueSeguranca: ssCalc, minimoEfetivo, minimoOrigem,
    estoqueAtual, emTransito, prev30, prev60, prev90,
    qtdSugeridaBruta: qtdBruta, qtdSugerida, alerta, memoria: mem,
  };
}

/** Alerta de ruptura relativo ao lead time e à janela de decisão. */
function classificarAlerta(a: {
  estoqueAtual: number; emTransito: number; cmd: number;
  leadTime: number; janela: number; minimoEfetivo: number; qtdBruta: number;
}): ResultadoConsolidado['alerta'] {
  const cobertura = a.estoqueAtual + a.emTransito;
  if (a.cmd <= 0) return a.qtdBruta > 0 ? 'atencao' : 'ok';
  const diasRuptura = cobertura / a.cmd;
  if (diasRuptura < a.leadTime) return 'ja_era'; // rompe antes de o pedido chegar
  if (diasRuptura < a.janela) return 'critico'; // rompe dentro da cobertura alvo
  if (diasRuptura < 90) return 'atencao';
  return a.qtdBruta > 0 ? 'atencao' : 'ok';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Reexport util p/ o job resolver diasNoMes ao montar MesSaida.
export { diasNoMes };
