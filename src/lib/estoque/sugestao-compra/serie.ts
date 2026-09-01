// Monta a série mensal de saída (MesSaida[]) a partir do razão cru de
// estoque_movimentos, incluindo o "dias com saldo positivo" que a correção de
// censura do motor precisa e que a view não entrega com precisão.
//
// Função PURA (recebe os movimentos já lidos); unit-testável (serie.test.ts).
// O job e o endpoint de inspeção usam isto para não recalcular censura em SQL.

import { diasNoMes, type MesSaida } from './motor';

/** Linha crua de estoque_movimentos relevante para a série. */
export interface MovimentoCru {
  data: string; // 'YYYY-MM-DD'
  ano: number;
  mes: number; // 1..12
  cod_origem: string;
  qtde_saida: number; // NEGATIVO no razão
  qtde_anterior: number; // saldo ANTES do movimento
  qtde_atual: number; // saldo DEPOIS do movimento
}

const DEMANDA_ORIGENS = new Set(['VEN']); // whitelist travada (v1): só Venda de Produto

/**
 * Constrói os 12 meses anteriores a `hoje` (inclusive o mês corrente parcial).
 * - demanda = Σ(-qtde_saida) só das origens da whitelist naquele mês;
 * - diasComSaldoPositivo = dias do mês em que o saldo (de TODOS os movimentos,
 *   não só venda) esteve > 0, caminhando a série dia a dia.
 * Meses sem nenhum movimento herdam o último saldo conhecido.
 */
export function montarSerie12m(movs: MovimentoCru[], hoje: Date = new Date()): MesSaida[] {
  // ordena por data asc (empate: arbitrário — sem sequência intradia no razão)
  const ordenados = [...movs].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));

  // saldo conhecido ANTES da janela (último qtde_atual antes do 1º mês da janela)
  const meses = ultimos12Meses(hoje);
  const primeiro = meses[0];
  const inicioJanela = `${primeiro.ano}-${String(primeiro.mes).padStart(2, '0')}-01`;

  let saldoHerdado = 0;
  for (const m of ordenados) {
    if (m.data < inicioJanela) saldoHerdado = m.qtde_atual;
    else break;
  }

  const porMes = new Map<string, MovimentoCru[]>();
  for (const m of ordenados) {
    const k = `${m.ano}-${m.mes}`;
    (porMes.get(k) ?? porMes.set(k, []).get(k)!).push(m);
  }

  const saida: MesSaida[] = [];
  let saldoEntrada = saldoHerdado;
  for (const { ano, mes } of meses) {
    const dim = diasNoMes(ano, mes);
    const doMes = porMes.get(`${ano}-${mes}`) ?? [];
    const demanda = doMes
      .filter((m) => DEMANDA_ORIGENS.has(String(m.cod_origem).toUpperCase()))
      .reduce((a, m) => a + -m.qtde_saida, 0);

    const diasPos = diasComSaldoPositivo(saldoEntrada, doMes, ano, mes, dim);

    saida.push({ ano, mes, demanda, diasNoMes: dim, diasComSaldoPositivo: diasPos });

    // saldo que entra no próximo mês = último saldo do mês (ou o herdado se sem movimento)
    saldoEntrada = doMes.length ? doMes[doMes.length - 1].qtde_atual : saldoEntrada;
  }
  return saida;
}

/** Dias do mês com saldo > 0, dado o saldo de entrada e os movimentos do mês. */
function diasComSaldoPositivo(saldoEntrada: number, doMes: MovimentoCru[], ano: number, mes: number, dim: number): number {
  if (doMes.length === 0) return saldoEntrada > 0 ? dim : 0;

  // saldo ao FIM de cada dia: parte do saldo de entrada; cada movimento fixa o
  // saldo do seu dia em diante (usa o último qtde_atual do dia).
  const saldoFimDoDia = new Map<number, number>(); // dia (1..dim) -> saldo
  for (const m of doMes) {
    const dia = Number(m.data.slice(8, 10));
    saldoFimDoDia.set(dia, m.qtde_atual); // se vários no dia, o último vence (ordem asc)
  }

  let saldo = saldoEntrada;
  let cont = 0;
  for (let d = 1; d <= dim; d++) {
    if (saldoFimDoDia.has(d)) saldo = saldoFimDoDia.get(d)!;
    if (saldo > 0) cont++;
  }
  return cont;
}

/** Lista dos 12 meses anteriores a `hoje`, do mais antigo ao corrente. */
export function ultimos12Meses(hoje: Date): Array<{ ano: number; mes: number }> {
  const out: Array<{ ano: number; mes: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    out.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 });
  }
  return out;
}
