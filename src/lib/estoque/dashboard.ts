// Lógica do /api/dashboard: dados por período (produtos + OS) + montagem dos
// cards com comparativos (mês anterior, ano anterior) e projeção do mês corrente.
// Portado de obterDadosPeriodo + handler /api/dashboard (server.js:1373/1395).

import { obterItensProdutos, buscarItensDoBanco } from './vendas-sync';
import { obterTotaisOS, obterTotaisOSAno, obterTiposComNotaMes, type TotaisOS } from './os';
import { agregarCards, agregarMaquinas, getCategoriasConfig, type ItemVenda, type MaquinaFamilia } from './categorias';
import { somarComprasPecas } from './dashboard-listas';
import { ehMesAtual, ehAnoAtual, sleep, MESES_CURTO } from './utils';
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
  /** Valor comprado (entradas de NF) no período, só peças. */
  totalCompras: number;
  /** Vendas de máquinas agregadas por família (receita/unidades/CMV). */
  maquinas: MaquinaFamilia[];
}

/** Agrega itens de produto + totais de OS nos cards do dashboard. */
async function montarDados(
  itens: ItemVenda[],
  os: TotaisOS,
  filtroCategoria: string | null,
  totalCompras = 0,
): Promise<DadosPeriodo> {
  const totalOS = os.total;

  const cats = await getCategoriasConfig();
  const agg = agregarCards(itens, filtroCategoria, cats);
  const maquinas = agregarMaquinas(itens);
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
    totalCompras,
    maquinas,
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
  const totalCompras = await somarComprasPecas(mes, ano, conta);
  return montarDados(itens, os, filtroCategoria, totalCompras);
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
  const comprasMeses = await Promise.all(meses.map((m) => somarComprasPecas(m, ano, conta)));
  const totalCompras = comprasMeses.reduce((s, v) => s + v, 0);
  return montarDados(itens, os, filtroCategoria, totalCompras);
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
  /** Só nos cards 'maquina'/'totalMaquinas': unidades (quantidade) vendidas no período. */
  unidades?: number;
  /** Unidades do mês anterior / mesmo período do ano anterior (p/ supressão de base baixa). */
  unidadesMesAnt?: number;
  unidadesAnoAnt?: number;
}

export interface DashboardResponse {
  periodo: string;
  modo: ModoPeriodo;
  /** 0 no modo 'ano'. */
  mes: number;
  ano: number;
  categorias: DashboardCategoria[];
  /** O período selecionado é o corrente (mês/ano em andamento — dados parciais). */
  ehMesCorrente: boolean;
  /** Máquinas acumuladas no ano (jan até o mês selecionado). */
  maquinasYTD: { unidades: number; receita: number };
}

const DADOS_ZERADOS: DadosPeriodo = {
  card1: 0, card2: 0, card3: 0, cards: [], custosCards: [], nomesCat: [],
  totalOS: 0, osNota: null, osInterno: null, osInternoRetorno: null, osInternoPuro: null, totalPecas: 0, totalCustoPecas: 0, totalGeral: 0,
  totalCompras: 0, maquinas: [],
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

  // Comparativos MENSAIS crus (sem ajuste por dias úteis nem projeção). Quando o
  // período é o corrente, o front sinaliza "mês em andamento" e esmaece as
  // variações (comparação parcial) — sem escalar nada.
  const ehCorrente = ehAno ? ehAnoAtual(selAno) : ehMesAtual(selMes, selAno);

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
    return {
      nome,
      valorAtual: atualVal,
      custoAtual,
      margemAtual: atualVal - custoAtual,
      mesAnteriorValor: anteriorVal,
      mesAnteriorCusto: custoAnterior,
      anoAnteriorValor: anoAntVal,
      anoAnteriorCusto: custoAnoAnt,
      varMesAnterior: calcVar(atualVal, anteriorVal),
      varAnoAnterior: calcVar(atualVal, anoAntVal),
      valorProjetado: null,
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
  // "Comprei": entradas de peças (NF) no período — dinheiro que SAI, comparável
  // ao custo das peças. Não segue o filtro de categoria de produto (é peças-wide).
  const comprei = montarCategoria('Comprei (peças)', atual.totalCompras, anterior.totalCompras, anoAnt.totalCompras, 'compras');
  const totalGeral = montarCategoria('Total Geral Servicos + Pecas', atual.totalGeral, anterior.totalGeral, anoAnt.totalGeral, 'totalGeral',
    atual.totalCustoPecas, anterior.totalCustoPecas, anoAnt.totalCustoPecas);

  // Cards de MÁQUINAS por família (faixa separada). Venda de máquina é "caroço":
  // o destaque é UNIDADES + faturamento, comparativo relevante é ano-a-ano.
  // Top 8 famílias por receita; o excedente vira "Outras máquinas".
  const MAX_MAQUINAS = 8;
  const acharMaq = (arr: MaquinaFamilia[], fam: string) => arr.find((m) => m.familia === fam);
  const ordenadas = atual.maquinas; // já vem ordenado por receita desc
  const top = ordenadas.slice(0, MAX_MAQUINAS);
  const resto = ordenadas.slice(MAX_MAQUINAS);
  const maquinaCards: DashboardCategoria[] = top.map((m) => {
    const card = montarCategoria(
      m.familia,
      m.receita,
      acharMaq(anterior.maquinas, m.familia)?.receita || 0,
      acharMaq(anoAnt.maquinas, m.familia)?.receita || 0,
      'maquina',
      m.cmv,
      acharMaq(anterior.maquinas, m.familia)?.cmv || 0,
      acharMaq(anoAnt.maquinas, m.familia)?.cmv || 0,
    );
    card.unidades = m.unidades;
    card.unidadesMesAnt = acharMaq(anterior.maquinas, m.familia)?.unidades || 0;
    card.unidadesAnoAnt = acharMaq(anoAnt.maquinas, m.familia)?.unidades || 0;
    return card;
  });
  if (resto.length > 0) {
    const somaResto = (arr: MaquinaFamilia[]) =>
      arr.filter((m) => !top.some((t) => t.familia === m.familia)).reduce((s, m) => s + m.receita, 0);
    const somaRestoUn = (arr: MaquinaFamilia[]) =>
      arr.filter((m) => !top.some((t) => t.familia === m.familia)).reduce((s, m) => s + m.unidades, 0);
    const outras = montarCategoria('Outras máquinas', somaResto(atual.maquinas), somaResto(anterior.maquinas), somaResto(anoAnt.maquinas), 'maquina');
    outras.unidades = resto.reduce((s, m) => s + m.unidades, 0);
    outras.unidadesMesAnt = somaRestoUn(anterior.maquinas);
    outras.unidadesAnoAnt = somaRestoUn(anoAnt.maquinas);
    maquinaCards.push(outras);
  }
  // Item 1c: famílias que venderam no mês/ano anterior mas estão ZERADAS agora —
  // exibidas apagadas (ausência de venda é informação), não ocultadas.
  const nomesAtual = new Set(atual.maquinas.map((m) => m.familia));
  const zeradas = new Set<string>();
  [...anterior.maquinas, ...anoAnt.maquinas].forEach((m) => { if (!nomesAtual.has(m.familia)) zeradas.add(m.familia); });
  for (const fam of zeradas) {
    const card = montarCategoria(fam, 0, acharMaq(anterior.maquinas, fam)?.receita || 0, acharMaq(anoAnt.maquinas, fam)?.receita || 0, 'maquina');
    card.unidades = 0;
    card.unidadesMesAnt = acharMaq(anterior.maquinas, fam)?.unidades || 0;
    card.unidadesAnoAnt = acharMaq(anoAnt.maquinas, fam)?.unidades || 0;
    maquinaCards.push(card);
  }
  // Card-resumo "Máquinas — total" (Σ receita + Σ unidades de todas as famílias).
  const somaReceita = (arr: MaquinaFamilia[]) => arr.reduce((s, m) => s + m.receita, 0);
  const somaUnidades = (arr: MaquinaFamilia[]) => arr.reduce((s, m) => s + m.unidades, 0);
  const totalMaquinas = montarCategoria('Máquinas — total', somaReceita(atual.maquinas), somaReceita(anterior.maquinas), somaReceita(anoAnt.maquinas), 'totalMaquinas');
  totalMaquinas.unidades = somaUnidades(atual.maquinas);
  totalMaquinas.unidadesMesAnt = somaUnidades(anterior.maquinas);
  totalMaquinas.unidadesAnoAnt = somaUnidades(anoAnt.maquinas);

  // Ordem dos cards (grade de 4 colunas): Serviços fecha a 1ª linha e os totais
  // ficam na coluna da direita, um por linha. "Comprei" fica logo abaixo de Total
  // Peças (ambos são peças) e acima da régua que separa o Total Geral. Os cards de
  // máquina vão numa faixa separada (o page.tsx os agrupa pela cardType).
  const corte = Math.min(3, produtos.length);
  const categorias: DashboardCategoria[] = [
    ...produtos.slice(0, corte),
    servicos,
    ...produtos.slice(corte),
    totalPecas,
    comprei,
    totalGeral,
    ...(maquinaCards.length > 0 ? [totalMaquinas, ...maquinaCards] : []),
  ];

  // YTD de máquinas: jan até o mês selecionado (ano mode → ano todo). Lê só o
  // banco (o mês corrente já foi sincronizado pela leitura do período atual).
  const ateMes = ehAno ? 12 : selMes;
  const listasYTD = await Promise.all(
    Array.from({ length: ateMes }, (_, i) => i + 1).map((m) => buscarItensDoBanco(m, selAno, conta)),
  );
  const maqYTD = agregarMaquinas(listasYTD.flatMap((l) => l || []));
  const maquinasYTD = { unidades: maqYTD.reduce((s, m) => s + m.unidades, 0), receita: maqYTD.reduce((s, m) => s + m.receita, 0) };

  return {
    periodo: ehAno ? 'Ano ' + selAno : MESES_CURTO[selMes - 1] + ' ' + selAno,
    modo,
    mes: ehAno ? 0 : selMes,
    ano: selAno,
    categorias,
    ehMesCorrente: ehCorrente,
    maquinasYTD,
  };
}
