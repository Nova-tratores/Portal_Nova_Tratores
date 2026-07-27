// Lógica do /api/dashboard: dados por período (produtos + OS) + montagem dos
// cards com comparativos (mês anterior, ano anterior) e projeção do mês corrente.
// Portado de obterDadosPeriodo + handler /api/dashboard (server.js:1373/1395).

import { obterItensProdutos, buscarItensDoBanco } from './vendas-sync';
import { obterTotaisOS, obterTotaisOSAno, obterTiposComNotaMes, type TotaisOS } from './os';
import { agregarCards, getCategoriasConfig, type ItemVenda } from './categorias';
import {
  ehMesAtual, ehAnoAtual, diasUteisDoMes, diasUteisAteHoje, diasUteisDoAno,
  diasUteisAteHojeNoAno, sleep, MESES_CURTO,
} from './utils';
import type { ContaFiltro } from './conta';

/** Período do dashboard: um mês ou o ano inteiro (jan–dez). */
export type ModoPeriodo = 'mes' | 'ano';

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
  osInternoRetorno: number | null;
  osInternoPuro: number | null;
  totalPecas: number;
  totalCustoPecas: number;
  totalGeral: number;
}

/** Agrega itens de produto + totais de OS nos cards do dashboard. */
async function montarDados(
  itens: ItemVenda[],
  os: TotaisOS,
  filtroCategoria: string | null,
): Promise<DadosPeriodo> {
  const totalOS = os.total;

  const cats = await getCategoriasConfig();
  const agg = agregarCards(itens, filtroCategoria, cats);
  const totalPecas = agg.cards.reduce((s, v) => s + v, 0);
  const totalCustoPecas = agg.custosCards.reduce((s, v) => s + v, 0);
  // Receita de serviços = com nota + interno "com retorno" (garantia/entrega/
  // revisão/normal sem nota), espelhando a régua do OMIE; só o interno PURO
  // (cortesia/contrato interno) fica de fora. Enquanto o mês não tem o sub-split
  // no os_mensal, usa só o com-nota (retorno=null → 0) e converge via refresh BG;
  // sem nem o com-nota, cai no total de OS.
  const receitaServicos = os.nota != null ? os.nota + (os.internoRetorno ?? 0) : totalOS;
  const totalGeral = totalPecas + receitaServicos;

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
    osInternoRetorno: os.internoRetorno,
    osInternoPuro: os.internoPuro,
    totalPecas,
    totalCustoPecas,
    totalGeral,
  };
}

/** Monta dados de um mês (produtos + OS). filtroCategoria afeta só os cards de produto. */
export async function obterDadosPeriodo(
  mes: number,
  ano: number,
  filtroCategoria: string | null,
  conta: ContaFiltro,
): Promise<DadosPeriodo> {
  const itens = await obterItensProdutos(mes, ano, conta);
  await sleep(500);
  const os = await obterTotaisOS(mes, ano, conta);
  return montarDados(itens, os, filtroCategoria);
}

/**
 * Monta dados de um ANO inteiro (jan–dez) somando os 12 meses.
 * Lê SÓ o que já está no banco: meses passados sem cache não disparam sync
 * (12 syncs Omie concorrentes) — aparecem quando o mês for aberto na visão
 * mensal ou pelo cron noturno. O mês corrente segue o caminho normal
 * (cache + refresh em background).
 */
export async function obterDadosAno(
  ano: number,
  filtroCategoria: string | null,
  conta: ContaFiltro,
): Promise<DadosPeriodo> {
  const meses = Array.from({ length: 12 }, (_, i) => i + 1);
  const listas = await Promise.all(
    meses.map((m) => (ehMesAtual(m, ano) ? obterItensProdutos(m, ano, conta) : buscarItensDoBanco(m, ano, conta))),
  );
  const itens = listas.flatMap((l) => l || []);
  const os = await obterTotaisOSAno(ano, conta);
  return montarDados(itens, os, filtroCategoria);
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
  /**
   * Só no card 'servico': sub-split do `valorInterno` (régua do dashboard OMIE).
   *   - valorInternoRetorno = garantia/entrega/revisão/normal sem nota (rendeu).
   *   - valorInternoPuro    = cortesia + contrato interno (interno de verdade).
   * Ausentes em meses ainda não reprocessados → a UI cai no "Interno" único.
   */
  valorInternoRetorno?: number;
  valorInternoPuro?: number;
  /** Só no card 'servico': composição do valor COM NOTA por tipo (os_servicos_itens × os_nfse). */
  valorHR?: number;
  valorKM?: number;
  valorOutros?: number;
}

export interface DashboardResponse {
  periodo: string;
  modo: ModoPeriodo;
  /** 0 no modo 'ano'. */
  mes: number;
  ano: number;
  categorias: DashboardCategoria[];
  /** No modo 'ano': o ano selecionado é o corrente (dados parciais). */
  ehMesCorrente: boolean;
  proporcao: number | null;
  diasUteisTranscorridos: number | null;
  diasUteisTotal: number | null;
}

const DADOS_ZERADOS: DadosPeriodo = {
  card1: 0, card2: 0, card3: 0, cards: [], custosCards: [], nomesCat: [],
  totalOS: 0, osNota: null, osInterno: null, osInternoRetorno: null, osInternoPuro: null, totalPecas: 0, totalCustoPecas: 0, totalGeral: 0,
};

/**
 * Monta a resposta completa do /api/dashboard.
 * `modo = 'mes'`: período = selMes/selAno; compara com o mês anterior e com o
 * mesmo mês do ano anterior.
 * `modo = 'ano'`: período = jan–dez de selAno; só compara com o ano anterior
 * (não existe "mês anterior"). No ano corrente os comparativos são ajustados
 * pelos dias úteis já transcorridos no ano e a projeção é do ano fechado.
 */
export async function montarDashboard(
  selMes: number,
  selAno: number,
  filtroCategoria: string | null,
  conta: ContaFiltro,
  modo: ModoPeriodo = 'mes',
): Promise<DashboardResponse> {
  const ehAno = modo === 'ano';
  const mesAntDate = new Date(selAno, selMes - 2, 1);
  const mesAnt = mesAntDate.getMonth() + 1;
  const anoMesAnt = mesAntDate.getFullYear();
  const anoAnoAnt = selAno - 1;

  const atual = ehAno
    ? await obterDadosAno(selAno, filtroCategoria, conta)
    : await obterDadosPeriodo(selMes, selAno, filtroCategoria, conta);
  const anterior = ehAno ? DADOS_ZERADOS : await obterDadosPeriodo(mesAnt, anoMesAnt, filtroCategoria, conta);
  const anoAnt = ehAno
    ? await obterDadosAno(anoAnoAnt, filtroCategoria, conta)
    : await obterDadosPeriodo(selMes, anoAnoAnt, filtroCategoria, conta);

  const calcVar = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0);

  const ehCorrente = ehAno ? ehAnoAtual(selAno) : ehMesAtual(selMes, selAno);
  const totalDU = !ehCorrente ? 0 : ehAno ? diasUteisDoAno(selAno) : diasUteisDoMes(selAno, selMes);
  const transcorridoDU = !ehCorrente ? 0 : ehAno ? diasUteisAteHojeNoAno(selAno) : diasUteisAteHoje(selAno, selMes);
  const proporcao = ehCorrente && totalDU > 0 ? transcorridoDU / totalDU : 1;
  const ajustar = (v: number) => (ehCorrente ? v * proporcao : v);
  const projetar = (v: number) => (ehCorrente && proporcao > 0 ? v / proporcao : null);

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
  // Valor do card = receita de serviços (com nota + interno c/ retorno). Assim o
  // número grande, a projeção e os comparativos mês/ano ficam todos na mesma base.
  const receitaOS = (d: DadosPeriodo): number => (d.osNota != null ? d.osNota + (d.osInternoRetorno ?? 0) : d.totalOS);
  const servicos = montarCategoria('Servicos', receitaOS(atual), receitaOS(anterior), receitaOS(anoAnt), 'servico');
  if (atual.osNota != null && atual.osInterno != null) {
    servicos.valorNota = atual.osNota;
    servicos.valorInterno = atual.osInterno;
    // Sub-split retorno × puro só quando o mês já foi reprocessado (colunas novas).
    if (atual.osInternoRetorno != null && atual.osInternoPuro != null) {
      servicos.valorInternoRetorno = atual.osInternoRetorno;
      servicos.valorInternoPuro = atual.osInternoPuro;
    }
  }
  const tipos = await obterTiposComNotaMes(ehAno ? null : selMes, selAno, conta);
  if (tipos) {
    servicos.valorHR = tipos.hr;
    servicos.valorKM = tipos.km;
    servicos.valorOutros = tipos.outros;
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
    periodo: ehAno ? 'Ano ' + selAno : MESES_CURTO[selMes - 1] + ' ' + selAno,
    modo,
    mes: ehAno ? 0 : selMes,
    ano: selAno,
    categorias,
    ehMesCorrente: ehCorrente,
    proporcao: ehCorrente ? proporcao : null,
    diasUteisTranscorridos: ehCorrente ? transcorridoDU : null,
    diasUteisTotal: ehCorrente ? totalDU : null,
  };
}
