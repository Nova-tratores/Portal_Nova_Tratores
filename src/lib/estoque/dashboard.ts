// Lógica do /api/dashboard: dados por período (produtos + OS) + montagem dos
// cards com comparativos (mês anterior, ano anterior) e projeção do mês corrente.
// Portado de obterDadosPeriodo + handler /api/dashboard (server.js:1373/1395).

import { obterItensProdutos } from './vendas-sync';
import { obterTotaisOS } from './os';
import { agregarCards, getCategoriasConfig } from './categorias';
import { ehMesAtual, diasUteisDoMes, diasUteisAteHoje, sleep, MESES_CURTO } from './utils';
import type { ContaFiltro } from './conta';

interface DadosPeriodo {
  card1: number;
  card2: number;
  card3: number;
  cards: number[];
  custosCards: number[];
  nomesCat: string[];
  totalOS: number;
  osNota: number | null;
  osInterno: number | null;
  totalPecas: number;
  totalCustoPecas: number;
  totalGeral: number;
}

/** Monta dados de um período (produtos + OS). filtroCategoria afeta só os cards de produto. */
export async function obterDadosPeriodo(
  mes: number,
  ano: number,
  filtroCategoria: string | null,
  conta: ContaFiltro,
): Promise<DadosPeriodo> {
  const itens = await obterItensProdutos(mes, ano, conta);
  await sleep(500);
  const os = await obterTotaisOS(mes, ano, conta);
  const totalOS = os.total;

  const cats = await getCategoriasConfig();
  const agg = agregarCards(itens, filtroCategoria, cats);
  const totalPecas = agg.cards.reduce((s, v) => s + v, 0);
  const totalCustoPecas = agg.custosCards.reduce((s, v) => s + v, 0);
  const totalGeral = totalPecas + totalOS;

  return {
    card1: agg.card1,
    card2: agg.card2,
    card3: agg.card3,
    cards: agg.cards,
    custosCards: agg.custosCards,
    nomesCat: agg.nomesCat,
    totalOS,
    osNota: os.nota,
    osInterno: os.interno,
    totalPecas,
    totalCustoPecas,
    totalGeral,
  };
}

export interface DashboardCategoria {
  nome: string;
  valorAtual: number;
  custoAtual: number;
  margemAtual: number;
  mesAnteriorValor: number;
  mesAnteriorCusto: number;
  anoAnteriorValor: number;
  anoAnteriorCusto: number;
  varMesAnterior: number;
  varAnoAnterior: number;
  valorProjetado: number | null;
  cardType: string;
  /** Só no card 'servico': split do valor atual (OS faturadas com NFS-e × fechadas internas, sem nota). */
  valorNota?: number;
  valorInterno?: number;
}

export interface DashboardResponse {
  periodo: string;
  mes: number;
  ano: number;
  categorias: DashboardCategoria[];
  ehMesCorrente: boolean;
  proporcao: number | null;
  diasUteisTranscorridos: number | null;
  diasUteisTotal: number | null;
}

/** Monta a resposta completa do /api/dashboard para (mes, ano, categoria, conta). */
export async function montarDashboard(
  selMes: number,
  selAno: number,
  filtroCategoria: string | null,
  conta: ContaFiltro,
): Promise<DashboardResponse> {
  const mesAntDate = new Date(selAno, selMes - 2, 1);
  const mesAnt = mesAntDate.getMonth() + 1;
  const anoMesAnt = mesAntDate.getFullYear();
  const anoAnoAnt = selAno - 1;

  const atual = await obterDadosPeriodo(selMes, selAno, filtroCategoria, conta);
  const anterior = await obterDadosPeriodo(mesAnt, anoMesAnt, filtroCategoria, conta);
  const anoAnt = await obterDadosPeriodo(selMes, anoAnoAnt, filtroCategoria, conta);

  const calcVar = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0);

  const ehMesCorrente = ehMesAtual(selMes, selAno);
  const totalDU = ehMesCorrente ? diasUteisDoMes(selAno, selMes) : 0;
  const transcorridoDU = ehMesCorrente ? diasUteisAteHoje(selAno, selMes) : 0;
  const proporcao = ehMesCorrente && totalDU > 0 ? transcorridoDU / totalDU : 1;
  const ajustar = (v: number) => (ehMesCorrente ? v * proporcao : v);
  const projetar = (v: number) => (ehMesCorrente && proporcao > 0 ? v / proporcao : null);

  const montarCategoria = (
    nome: string,
    atualVal: number,
    anteriorVal: number,
    anoAntVal: number,
    cardType: string,
    custoAtual = 0,
    custoAnterior = 0,
    custoAnoAnt = 0,
  ): DashboardCategoria => {
    const mesAntProporcional = ajustar(anteriorVal);
    const anoAntProporcional = ajustar(anoAntVal);
    return {
      nome,
      valorAtual: atualVal,
      custoAtual,
      margemAtual: atualVal - custoAtual,
      mesAnteriorValor: mesAntProporcional,
      mesAnteriorCusto: ajustar(custoAnterior),
      anoAnteriorValor: anoAntProporcional,
      anoAnteriorCusto: ajustar(custoAnoAnt),
      varMesAnterior: calcVar(atualVal, mesAntProporcional),
      varAnoAnterior: calcVar(atualVal, anoAntProporcional),
      valorProjetado: projetar(atualVal),
      cardType,
    };
  };

  const produtos: DashboardCategoria[] = [];
  for (let i = 0; i < atual.cards.length; i++) {
    produtos.push(
      montarCategoria(
        atual.nomesCat[i] || 'Card ' + (i + 1),
        atual.cards[i],
        anterior.cards[i] || 0,
        anoAnt.cards[i] || 0,
        'produto',
        atual.custosCards[i] || 0,
        anterior.custosCards[i] || 0,
        anoAnt.custosCards[i] || 0,
      ),
    );
  }
  const servicos = montarCategoria('Servicos', atual.totalOS, anterior.totalOS, anoAnt.totalOS, 'servico');
  if (atual.osNota != null && atual.osInterno != null) {
    servicos.valorNota = atual.osNota;
    servicos.valorInterno = atual.osInterno;
  }
  const totalPecas = montarCategoria('Total Pecas', atual.totalPecas, anterior.totalPecas, anoAnt.totalPecas, 'totalPecas',
    atual.totalCustoPecas, anterior.totalCustoPecas, anoAnt.totalCustoPecas);
  const totalGeral = montarCategoria('Total Geral Servicos + Pecas', atual.totalGeral, anterior.totalGeral, anoAnt.totalGeral, 'totalGeral',
    atual.totalCustoPecas, anterior.totalCustoPecas, anoAnt.totalCustoPecas);

  // Ordem dos cards (grade de 4 colunas): Serviços fecha a 1ª linha e os totais
  // ficam na coluna da direita, um por linha.
  const corte = Math.min(3, produtos.length);
  const categorias: DashboardCategoria[] = [
    ...produtos.slice(0, corte),
    servicos,
    ...produtos.slice(corte),
    totalPecas,
    totalGeral,
  ];

  return {
    periodo: MESES_CURTO[selMes - 1] + ' ' + selAno,
    mes: selMes,
    ano: selAno,
    categorias,
    ehMesCorrente,
    proporcao: ehMesCorrente ? proporcao : null,
    diasUteisTranscorridos: ehMesCorrente ? transcorridoDU : null,
    diasUteisTotal: ehMesCorrente ? totalDU : null,
  };
}
