// Agenda de pagamentos do Financeiro (José, 29/10/2026): a semana de segunda a domingo com tudo
// que vence a receber (contas_receber) e a pagar (contas_pagar) — o espelho do Omie que o DRE
// sincroniza — e a situação de cada título: pago, atrasado, vence hoje ou a vencer.
//
// Regras (puras, sem banco):
//   - o título entra no DIA do vencimento (data_vencimento); a previsão aparece quando é outra data;
//   - pago = tem data_pagamento ou o Omie dá RECEBIDO/PAGO; CANCELADO não entra;
//   - em aberto, o PRAZO é a previsão (quando houver) — é assim que o Omie decide ATRASADO
//     (conferido em 29/10: vencimento 02/10 com previsão 03/11 = "A VENCER"; vencimento 20/11 com
//     previsão 20/10 = "ATRASADO"). Prazo antes de hoje = atrasado; hoje = vence hoje; depois = a vencer;
//   - "hoje" é sempre o dia de Brasília (hojeBR); datas "AAAA-MM-DD" são comparadas como texto ou
//     convertidas com Date.UTC — nunca new Date('AAAA-MM-DD'), que vira o dia anterior no fuso -03.
import { contaDaEmpresa, numValor, titulosDoCard, type CardFase, type TituloOmie } from "@/lib/financeiro/fases-automaticas";

export type TipoConta = "receber" | "pagar";
export type SituacaoAgenda = "pago" | "atrasado" | "hoje" | "a_vencer";
export type ContaFiltro = "NOVA" | "CASTRO" | "todas";
export type TipoFiltro = "receber" | "pagar" | "ambos";

/** Linha de contas_receber / contas_pagar (só as colunas que a agenda usa). */
export type TituloAgenda = {
  id: number;
  conta_omie: string | null;
  numero_documento_fiscal?: string | null;
  numero_parcela?: string | null;
  data_emissao?: string | null;
  data_vencimento: string | null;
  data_previsao?: string | null;
  data_pagamento?: string | null;
  valor_documento?: number | string | null;
  valor_pago?: number | string | null;
  status_titulo?: string | null;
  nome_cliente?: string | null;
  nome_fornecedor?: string | null;
  descricao_categoria?: string | null;
  grupo_categoria?: string | null;
  descricao_departamento?: string | null;
  numero_documento?: string | null;
  numero_boleto?: string | null;
  observacao?: string | null;
  valor_imp_retido?: number | string | null;
  codigo_cliente_fornecedor?: number | string | null;
  incluido_por?: string | null;
  data_inclusao?: string | null;
  alterado_por?: string | null;
  data_alteracao?: string | null;
  synced_at?: string | null;
};

const COLUNAS_DETALHE = "grupo_categoria, descricao_departamento, numero_documento, numero_boleto, observacao, valor_imp_retido, codigo_cliente_fornecedor, incluido_por, data_inclusao, alterado_por, data_alteracao, synced_at";

export const COLUNAS_AGENDA_RECEBER =
  "id, conta_omie, numero_documento_fiscal, numero_parcela, data_emissao, data_vencimento, data_previsao, data_pagamento, valor_documento, valor_pago, status_titulo, nome_cliente, descricao_categoria, " + COLUNAS_DETALHE;
export const COLUNAS_AGENDA_PAGAR =
  "id, conta_omie, numero_documento_fiscal, numero_parcela, data_emissao, data_vencimento, data_previsao, data_pagamento, valor_documento, valor_pago, status_titulo, nome_fornecedor, descricao_categoria, " + COLUNAS_DETALHE;

export type CardLigado = { id: number; status: string; setor: string; href: string; tarefa: string; formaPagamento: string; vencimentoBoleto: string | null };

export type ItemAgenda = {
  chave: string; // "receber-123" (único entre as duas tabelas)
  tipo: TipoConta;
  id: number;
  conta: string;
  nome: string;
  nf: string;
  parcela: string;
  categoria: string;
  vencimento: string;
  previsao: string | null; // só quando diferente do vencimento
  pagamento: string | null;
  valor: number;
  valorPago: number;
  valorAberto: number;
  situacao: SituacaoAgenda;
  diasAtraso: number; // > 0 só quando atrasado
  statusOmie: string;
  card: CardLigado | null;
  // detalhes para a janela do título
  emissao: string | null;
  documento: string;
  boleto: string;
  observacao: string;
  grupoCategoria: string;
  departamento: string;
  impostoRetido: number;
  codigoPessoa: string;
  incluidoPor: string;
  incluidoEm: string | null;
  alteradoPor: string;
  alteradoEm: string | null;
  sincronizadoEm: string | null;
};

export type TotaisLado = { total: number; pago: number; atraso: number; aberto: number; qtd: number; qtdPago: number; qtdAtraso: number; qtdAberto: number };
export type Totais = { receber: TotaisLado; pagar: TotaisLado };

export type DiaAgenda = { data: string; itens: ItemAgenda[]; totais: Totais };
export type Agenda = {
  semana: string;
  fim: string;
  hoje: string;
  dias: DiaAgenda[];
  totais: Totais;
  atrasadosAnteriores: { itens: ItemAgenda[]; totais: Totais };
};

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
export const ehDataISO = (s: unknown): s is string => typeof s === "string" && RE_DATA.test(s.slice(0, 10)) && s.length >= 10;

/** "AAAA-MM-DD" → milissegundos UTC da meia-noite (só para contar dias; sem fuso). */
function utc(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}
const isoDeUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "AAAA-MM-DD" + n dias. */
export const somarDias = (iso: string, n: number) => isoDeUtc(utc(iso) + n * 86_400_000);

/** Dias de a até b (b − a). */
export const diasEntre = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);

/** 0 = segunda … 6 = domingo. */
export const diaDaSemana = (iso: string) => (new Date(utc(iso)).getUTCDay() + 6) % 7;

/** Segunda-feira da semana da data. */
export const segundaDaSemana = (iso: string) => somarDias(iso, -diaDaSemana(iso));

/** As 7 datas da semana (segunda → domingo). */
export const diasDaSemana = (segunda: string) => Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));

/** Parâmetro ?semana= → segunda daquela semana (qualquer dia vale); inválido/vazio → semana de hoje. */
export function normalizarSemana(param: unknown, hoje: string): string {
  const p = typeof param === "string" ? param.trim().slice(0, 10) : "";
  if (ehDataISO(p) && !Number.isNaN(utc(p)) && isoDeUtc(utc(p)) === p) return segundaDaSemana(p);
  return segundaDaSemana(hoje);
}

export const normalizarConta = (v: unknown): ContaFiltro => {
  const t = String(v ?? "").toUpperCase();
  return t === "NOVA" ? "NOVA" : t === "CASTRO" ? "CASTRO" : "todas";
};
export const normalizarTipo = (v: unknown): TipoFiltro => {
  const t = String(v ?? "").toLowerCase();
  return t === "receber" ? "receber" : t === "pagar" ? "pagar" : "ambos";
};

const STATUS_PAGO = new Set(["RECEBIDO", "PAGO", "LIQUIDADO"]);
export const ehCancelado = (t: TituloAgenda) => String(t.status_titulo || "").toUpperCase() === "CANCELADO";
export const ehPago = (t: TituloAgenda) => ehDataISO(t.data_pagamento) || STATUS_PAGO.has(String(t.status_titulo || "").toUpperCase());

/** Prazo de verdade de um título em aberto: a previsão (como o Omie), senão o vencimento. */
export function prazoDoTitulo(t: TituloAgenda): string | null {
  if (ehDataISO(t.data_previsao)) return t.data_previsao.slice(0, 10);
  if (ehDataISO(t.data_vencimento)) return t.data_vencimento.slice(0, 10);
  return null;
}

/** Situação do título no dia `hoje` (Brasília). null = cancelado ou sem data (fica fora). */
export function situacaoDoTitulo(t: TituloAgenda, hoje: string): SituacaoAgenda | null {
  if (ehCancelado(t)) return null;
  if (ehPago(t)) return "pago";
  const prazo = prazoDoTitulo(t);
  if (!prazo) return null;
  if (prazo < hoje) return "atrasado";
  if (prazo === hoje) return "hoje";
  return "a_vencer";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Título do banco → linha da agenda (null se cancelado/sem data). */
export function montarItem(t: TituloAgenda, tipo: TipoConta, hoje: string): ItemAgenda | null {
  const situacao = situacaoDoTitulo(t, hoje);
  if (!situacao || !ehDataISO(t.data_vencimento)) return null;
  const venc = t.data_vencimento.slice(0, 10);
  const prev = ehDataISO(t.data_previsao) ? t.data_previsao.slice(0, 10) : null;
  const valor = numValor(t.valor_documento) || 0;
  const pagoNoOmie = numValor(t.valor_pago) || 0;
  const valorPago = situacao === "pago" ? (pagoNoOmie > 0 ? pagoNoOmie : valor) : Math.min(pagoNoOmie, valor);
  const valorAberto = situacao === "pago" ? 0 : r2(Math.max(valor - valorPago, 0));
  const prazo = prazoDoTitulo(t) || venc;
  return {
    chave: `${tipo}-${t.id}`,
    tipo,
    id: t.id,
    conta: String(t.conta_omie || "").toUpperCase(),
    nome: String((tipo === "receber" ? t.nome_cliente : t.nome_fornecedor) || "").trim() || "(sem nome)",
    nf: String(t.numero_documento_fiscal || "").trim().replace(/^0+(?=\d)/, ""),
    parcela: String(t.numero_parcela || "").trim(),
    categoria: String(t.descricao_categoria || "").trim(),
    vencimento: venc,
    previsao: prev && prev !== venc ? prev : null,
    pagamento: ehDataISO(t.data_pagamento) ? t.data_pagamento.slice(0, 10) : null,
    valor: r2(valor),
    valorPago: r2(valorPago),
    valorAberto,
    situacao,
    diasAtraso: situacao === "atrasado" ? diasEntre(prazo, hoje) : 0,
    statusOmie: String(t.status_titulo || ""),
    card: null,
    emissao: ehDataISO(t.data_emissao) ? t.data_emissao.slice(0, 10) : null,
    documento: String(t.numero_documento || "").trim(),
    boleto: String(t.numero_boleto || "").trim(),
    observacao: String(t.observacao || "").trim(),
    grupoCategoria: String(t.grupo_categoria || "").trim(),
    departamento: String(t.descricao_departamento || "").trim(),
    impostoRetido: r2(numValor(t.valor_imp_retido) || 0),
    codigoPessoa: String(t.codigo_cliente_fornecedor ?? "").trim(),
    incluidoPor: String(t.incluido_por || "").trim(),
    incluidoEm: t.data_inclusao || null,
    alteradoPor: String(t.alterado_por || "").trim(),
    alteradoEm: t.data_alteracao || null,
    sincronizadoEm: t.synced_at || null,
  };
}

const ladoVazio = (): TotaisLado => ({ total: 0, pago: 0, atraso: 0, aberto: 0, qtd: 0, qtdPago: 0, qtdAtraso: 0, qtdAberto: 0 });
export const totaisVazios = (): Totais => ({ receber: ladoVazio(), pagar: ladoVazio() });

/**
 * Totais por lado: total = tudo que vence (pago ou não); pago = recebido/pago; atraso = em aberto
 * e vencido; aberto = em aberto ainda no prazo (vence hoje + a vencer).
 */
export function somarTotais(itens: ItemAgenda[]): Totais {
  const t = totaisVazios();
  for (const i of itens) {
    const l = t[i.tipo];
    l.total += i.valor; l.qtd++;
    if (i.situacao === "pago") { l.pago += i.valorPago; l.qtdPago++; continue; }
    // pagamento parcial (raro) conta no pago e só o resto fica em aberto
    l.pago += i.valorPago;
    if (i.situacao === "atrasado") { l.atraso += i.valorAberto; l.qtdAtraso++; }
    else { l.aberto += i.valorAberto; l.qtdAberto++; }
  }
  for (const l of [t.receber, t.pagar]) { l.total = r2(l.total); l.pago = r2(l.pago); l.atraso = r2(l.atraso); l.aberto = r2(l.aberto); }
  return t;
}

const ORDEM_SIT: Record<SituacaoAgenda, number> = { atrasado: 0, hoje: 1, a_vencer: 2, pago: 3 };
/** Ordem dentro do dia: atrasados primeiro, depois hoje, a vencer e pagos; maior valor antes. */
export const ordenarItens = (a: ItemAgenda, b: ItemAgenda) =>
  ORDEM_SIT[a.situacao] - ORDEM_SIT[b.situacao] || b.valor - a.valor || a.nome.localeCompare(b.nome);

export type EntradaAgenda = {
  semana: string; // segunda
  hoje: string;
  receber?: TituloAgenda[]; // vencimento dentro da semana
  pagar?: TituloAgenda[];
  anterioresReceber?: TituloAgenda[]; // vencimento antes da segunda, em aberto
  anterioresPagar?: TituloAgenda[];
  cards?: Map<string, CardLigado>; // chave do item → card do portal
};

/** Monta a semana: itens por dia, totais do dia e da semana e os atrasados de antes. */
export function montarAgenda(e: EntradaAgenda): Agenda {
  const dias = diasDaSemana(e.semana);
  const fim = dias[6];
  const comCard = (i: ItemAgenda) => ({ ...i, card: e.cards?.get(i.chave) ?? null });
  const daSemana = (lista: TituloAgenda[] | undefined, tipo: TipoConta) => (lista || [])
    .map((t) => montarItem(t, tipo, e.hoje))
    .filter((i): i is ItemAgenda => !!i && i.vencimento >= e.semana && i.vencimento <= fim)
    .map(comCard);
  const itens = [...daSemana(e.receber, "receber"), ...daSemana(e.pagar, "pagar")];

  const anteriores = (lista: TituloAgenda[] | undefined, tipo: TipoConta) => (lista || [])
    .map((t) => montarItem(t, tipo, e.hoje))
    .filter((i): i is ItemAgenda => !!i && i.situacao === "atrasado" && i.vencimento < e.semana)
    .map(comCard);
  const atrasados = [...anteriores(e.anterioresReceber, "receber"), ...anteriores(e.anterioresPagar, "pagar")]
    .sort((a, b) => (a.vencimento < b.vencimento ? 1 : a.vencimento > b.vencimento ? -1 : b.valor - a.valor));

  return {
    semana: e.semana,
    fim,
    hoje: e.hoje,
    dias: dias.map((data) => {
      const doDia = itens.filter((i) => i.vencimento === data).sort(ordenarItens);
      return { data, itens: doDia, totais: somarTotais(doDia) };
    }),
    totais: somarTotais(itens),
    atrasadosAnteriores: { itens: atrasados, totais: somarTotais(atrasados) },
  };
}

export type HistoricoPessoa = {
  totalAberto: number;
  qtdAberto: number;
  totalAtraso: number;
  qtdAtraso: number;
  totalPago12m: number;
  qtdPago12m: number;
  /** Média de dias entre o vencimento e o pagamento nos últimos 12 meses (negativo = paga antes). */
  mediaDiasPagamento: number | null;
  outrosAbertos: ItemAgenda[];
  ultimosPagos: ItemAgenda[];
};

/** Todos os títulos de um cliente/fornecedor → como ele está e como costuma pagar. */
export function historicoDaPessoa(titulos: TituloAgenda[], tipo: TipoConta, hoje: string, chaveAtual: string): HistoricoPessoa {
  const itens = titulos.map((t) => montarItem(t, tipo, hoje)).filter((i): i is ItemAgenda => !!i);
  const abertos = itens.filter((i) => i.situacao !== "pago");
  const atrasados = abertos.filter((i) => i.situacao === "atrasado");
  const desde = somarDias(hoje, -365);
  const pagos = itens.filter((i) => i.situacao === "pago" && i.pagamento && i.pagamento >= desde)
    .sort((a, b) => (a.pagamento! < b.pagamento! ? 1 : -1));
  const soma = (l: ItemAgenda[], f: (i: ItemAgenda) => number) => r2(l.reduce((n, i) => n + f(i), 0));
  return {
    totalAberto: soma(abertos, (i) => i.valorAberto),
    qtdAberto: abertos.length,
    totalAtraso: soma(atrasados, (i) => i.valorAberto),
    qtdAtraso: atrasados.length,
    totalPago12m: soma(pagos, (i) => i.valorPago),
    qtdPago12m: pagos.length,
    mediaDiasPagamento: pagos.length ? Math.round(pagos.reduce((n, i) => n + diasEntre(i.vencimento, i.pagamento!), 0) / pagos.length) : null,
    outrosAbertos: abertos.filter((i) => i.chave !== chaveAtual).sort((a, b) => (a.vencimento < b.vencimento ? -1 : 1)).slice(0, 8),
    ultimosPagos: pagos.filter((i) => i.chave !== chaveAtual).slice(0, 5),
  };
}

/** Card do Chamado_NF com o setor (para escolher o kanban). */
export type CardAgenda = CardFase & { setor_destino?: string | null };

/** Link do card no portal: oficina → kanban do pós-vendas; peças → kanban de peças. */
export function hrefDoCard(id: number, setor: string | null | undefined): string {
  return /pec|peç/i.test(String(setor || "")) ? `/financeiro/kanban-pecas?id=${id}` : `/financeiro/kanban?id=${id}`;
}

/**
 * Liga os títulos a receber aos cards de cobrança do portal (mesma regra do robô de fases:
 * titulosDoCard — mesma empresa, mesma NF, mesmo cliente ou soma = valor do card).
 * Filho de grupo aponta para o card pai (é o pai que aparece no kanban).
 */
export function ligarCards(titulos: (TituloAgenda & TituloOmie)[], cards: CardAgenda[]): Map<string, CardLigado> {
  const mapa = new Map<string, CardLigado>();
  const porId = new Map(cards.map((c) => [c.id, c]));
  // a mesma NF existe na Nova e na Castro: só olha títulos da empresa do card
  for (const c of cards) {
    if (String(c.status) === "excluido") continue;
    const conta = contaDaEmpresa(c.omie_empresa);
    const candidatos = conta ? titulos.filter((t) => String(t.conta_omie).toUpperCase() === conta) : titulos;
    const meus = titulosDoCard(c, candidatos);
    if (!meus.length) continue;
    const alvo = (c.grupo_pai_id && porId.get(c.grupo_pai_id)) || c;
    const ligado: CardLigado = { id: alvo.id, status: String(alvo.status || ""), setor: String(alvo.setor_destino || ""), href: hrefDoCard(alvo.id, alvo.setor_destino), tarefa: String(alvo.tarefa || ""), formaPagamento: String(alvo.forma_pagamento || ""), vencimentoBoleto: alvo.vencimento_boleto ? String(alvo.vencimento_boleto).slice(0, 10) : null };
    for (const t of meus) {
      const chave = `receber-${(t as TituloAgenda).id}`;
      if (!mapa.has(chave)) mapa.set(chave, ligado);
    }
  }
  return mapa;
}
