// =============================================================================
// INTELIGÊNCIA DE VENDAS — calculadora de retorno da máquina (ideias 8, 11, 18).
// Lib PURA. O vendedor preenche o que sabe do produtor; o resto tem padrão.
//
// Compara "como ele faz hoje" (terceiriza ou máquina velha, em R$/ha) com a
// máquina nova (diesel + operador + manutenção + depreciação), mostra a
// parcela do financiamento (sistema Price) e em quanto tempo se paga.
//
// REGRA: divisão por zero devolve null (a tela mostra "—"), nunca Infinity.
// Taxas de financiamento NÃO são buscadas na internet: o vendedor confere com
// o banco (Plano Safra / BNDES mudam a cada safra).
// =============================================================================

export interface EntradaROI {
  areaHa: number; // área trabalhada por ano (soma das operações)
  custoAtualHa: number; // R$/ha que ele gasta hoje (terceirizando ou com a máquina velha)
  preco: number; // preço da máquina nova
  valorUsado: number; // usado dado na troca (abate do investimento)
  rendimentoHaH: number; // ha por hora
  consumoLH: number; // litros de diesel por hora
  precoDiesel: number; // R$/L
  operadorHora: number; // R$/h do operador (0 se é ele mesmo)
  manutencaoPctAno: number; // % do preço por ano
  vidaUtilAnos: number;
  residualPct: number; // % do preço que sobra no fim da vida útil
  // serviço para vizinhos (ideia 18: quem compra pode virar prestador)
  haTerceiros: number;
  precoServicoHa: number;
  // financiamento
  financiar: boolean;
  entradaPct: number;
  taxaAnualPct: number;
  prazoAnos: number;
  parcelasPorAno: 1 | 2 | 12;
}

export const PADRAO_ROI: EntradaROI = {
  areaHa: 600, custoAtualHa: 180, preco: 350000, valorUsado: 0,
  rendimentoHaH: 2.5, consumoLH: 12, precoDiesel: 6.2, operadorHora: 35, manutencaoPctAno: 3,
  vidaUtilAnos: 10, residualPct: 35, haTerceiros: 0, precoServicoHa: 180,
  financiar: true, entradaPct: 20, taxaAnualPct: 8.5, prazoAnos: 7, parcelasPorAno: 1,
};

export interface AnoFluxo { ano: number; economia: number; parcela: number; caixa: number; acumulado: number }

export interface ResultadoROI {
  horasAno: number | null;
  custoOperacionalAno: number;
  depreciacaoAno: number | null;
  custoNovoHa: number | null; // operação + depreciação, por ha próprio
  custoAtualAno: number;
  receitaTerceirosAno: number;
  economiaAno: number; // caixa: hoje − operação nova + serviço a terceiros
  investimentoLiquido: number;
  paybackAnos: number | null;
  financiado: number;
  entrada: number;
  parcela: number | null;
  totalParcelas: number | null;
  jurosTotais: number | null;
  parcelaAnual: number | null;
  sobraAnoComParcela: number | null; // economia − parcelas do ano
  fluxo: AnoFluxo[];
}

const pos = (n: unknown) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 0);

/** Parcela do sistema Price. Taxa 0 = divide igual. */
export function parcelaPrice(valor: number, taxaPeriodo: number, n: number): number | null {
  if (n <= 0) return null;
  if (valor <= 0) return 0;
  if (taxaPeriodo <= 0) return valor / n;
  const f = Math.pow(1 + taxaPeriodo, n);
  return (valor * taxaPeriodo * f) / (f - 1);
}

export function calcularROI(ent: EntradaROI): ResultadoROI {
  const area = pos(ent.areaHa);
  const haTer = pos(ent.haTerceiros);
  const rend = pos(ent.rendimentoHaH);
  const preco = pos(ent.preco);
  const usado = Math.min(pos(ent.valorUsado), preco);

  const horasProprias = rend ? area / rend : null;
  const horasTerceiros = rend ? haTer / rend : 0;
  const horasAno = horasProprias == null ? null : horasProprias + horasTerceiros;
  const custoHora = pos(ent.consumoLH) * pos(ent.precoDiesel) + pos(ent.operadorHora);
  const manut = (preco * pos(ent.manutencaoPctAno)) / 100;
  const custoOperacionalAno = (horasAno ?? 0) * custoHora + manut;

  const vida = pos(ent.vidaUtilAnos);
  const residual = (preco * pos(ent.residualPct)) / 100;
  const depreciacaoAno = vida ? (preco - residual) / vida : null;
  const custoNovoHa = area && depreciacaoAno != null ? (custoOperacionalAno + depreciacaoAno) / (area + haTer) : null;

  const custoAtualAno = area * pos(ent.custoAtualHa);
  const receitaTerceirosAno = haTer * pos(ent.precoServicoHa);
  const economiaAno = custoAtualAno + receitaTerceirosAno - custoOperacionalAno;

  const investimentoLiquido = preco - usado;
  const paybackAnos = economiaAno > 0 ? investimentoLiquido / economiaAno : null;

  // Financiamento: entrada sai do bolso (o usado conta como parte da entrada).
  let entrada = investimentoLiquido, financiado = 0, parcela: number | null = null, totalParcelas: number | null = null,
    jurosTotais: number | null = null, parcelaAnual: number | null = null;
  const n = Math.round(pos(ent.prazoAnos) * ent.parcelasPorAno);
  if (ent.financiar && n > 0) {
    const entradaTotal = Math.max(usado, (preco * pos(ent.entradaPct)) / 100);
    entrada = entradaTotal - usado;
    financiado = Math.max(0, preco - entradaTotal);
    const taxaPeriodo = Math.pow(1 + pos(ent.taxaAnualPct) / 100, 1 / ent.parcelasPorAno) - 1;
    parcela = parcelaPrice(financiado, taxaPeriodo, n);
    totalParcelas = parcela == null ? null : parcela * n;
    jurosTotais = totalParcelas == null ? null : totalParcelas - financiado;
    parcelaAnual = parcela == null ? null : parcela * ent.parcelasPorAno;
  }
  const sobraAnoComParcela = parcelaAnual == null ? null : economiaAno - parcelaAnual;

  const anos = Math.max(vida || 0, ent.financiar ? Math.ceil(pos(ent.prazoAnos)) : 0, 1);
  const fluxo: AnoFluxo[] = [];
  let acumulado = -entrada;
  for (let a = 1; a <= Math.min(anos, 20); a++) {
    const p = parcelaAnual != null && a <= Math.ceil(pos(ent.prazoAnos)) ? parcelaAnual : 0;
    const extra = a === vida ? residual : 0; // vende a máquina no fim
    const caixa = economiaAno - p + extra;
    acumulado += caixa;
    fluxo.push({ ano: a, economia: economiaAno, parcela: p, caixa, acumulado });
  }

  return {
    horasAno, custoOperacionalAno, depreciacaoAno, custoNovoHa, custoAtualAno, receitaTerceirosAno, economiaAno,
    investimentoLiquido, paybackAnos, financiado, entrada, parcela, totalParcelas, jurosTotais, parcelaAnual,
    sobraAnoComParcela, fluxo,
  };
}
