// Pedido de Máquinas — regras PURAS (sem banco, sem Omie). Client-safe.
import {
  normalizarPagamento, numeroBR, recalcularPercentuais,
  type PagamentoProposta, type MeioParcela,
} from '@/lib/propostas/pagamento';

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------
export type StatusPedidoMaquina =
  | 'em_montagem' | 'aguardando_credito' | 'aguardando_maquina' | 'enviado_omie' | 'faturado' | 'cancelado';

export interface FaseInfo { id: StatusPedidoMaquina; rotulo: string; curto: string; cor: string; automatica?: boolean; encerrada?: boolean }

export const FASES_PEDIDO_MAQUINA: FaseInfo[] = [
  { id: 'em_montagem', rotulo: 'Em montagem', curto: 'Montagem', cor: '#64748b' },
  { id: 'aguardando_credito', rotulo: 'Aguardando crédito / banco', curto: 'Crédito', cor: '#d97706' },
  { id: 'aguardando_maquina', rotulo: 'Aguardando máquina', curto: 'Máquina', cor: '#7c3aed' },
  { id: 'enviado_omie', rotulo: 'Enviado Omie', curto: 'Omie', cor: '#0284c7', automatica: true },
  { id: 'faturado', rotulo: 'Faturado', curto: 'Faturado', cor: '#16a34a', automatica: true, encerrada: true },
  { id: 'cancelado', rotulo: 'Cancelado', curto: 'Cancelado', cor: '#dc2626', encerrada: true },
];

export const faseInfo = (s: string | null | undefined): FaseInfo =>
  FASES_PEDIDO_MAQUINA.find((f) => f.id === s) || FASES_PEDIDO_MAQUINA[0];

/** Para onde o usuário pode arrastar. Enviado/Faturado só pelo envio/faturamento. */
export function podeMoverPara(de: string, para: string, opts: { enviado: boolean }): string | null {
  if (de === para) return null;
  const alvo = FASES_PEDIDO_MAQUINA.find((f) => f.id === para);
  if (!alvo) return 'Fase desconhecida.';
  if (de === 'faturado') return 'Pedido faturado não muda de fase.';
  if (para === 'faturado') return 'Use o botão Faturar.';
  if (para === 'enviado_omie' && !opts.enviado) return 'Use o botão Enviar para a Omie.';
  if (para === 'cancelado') return 'Use o botão Cancelar (pede o motivo).';
  if (de === 'cancelado') return 'Pedido cancelado não volta.';
  if (opts.enviado && para !== 'enviado_omie') return 'Pedido já está na Omie: só sai pelo faturamento ou cancelamento.';
  return null;
}

// ---------------------------------------------------------------------------
// Itens e parcelas
// ---------------------------------------------------------------------------
export interface ItemPedidoMaquina {
  id?: number;
  codigo: string;
  codigo_produto?: number | null;
  descricao: string;
  familia?: string | null;
  marca?: string | null;
  modelo?: string | null;
  chassi?: string | null;
  qtde: number;
  preco: number;
  desconto: number;
}

export interface ParcelaPedidoMaquina {
  n: number;
  vencimento: string;  // YYYY-MM-DD
  valor: number;
  percentual: number;
  meio: MeioParcela;
  entrada: boolean;
  origem_proposta_parcela: number | null; // 0 = entrada da proposta; 1..N; null = digitada
}

const c = (v: number) => Math.round((Number(v) || 0) * 100);

export function totalItem(i: Pick<ItemPedidoMaquina, 'qtde' | 'preco' | 'desconto'>): number {
  return Math.max(0, c((Number(i.qtde) || 0) * (Number(i.preco) || 0)) - c(i.desconto)) / 100;
}

export function totalItens(itens: ItemPedidoMaquina[]): number {
  return itens.reduce((s, i) => s + c(totalItem(i)), 0) / 100;
}

export function somaParcelas(p: ParcelaPedidoMaquina[]): number {
  return p.reduce((s, x) => s + c(x.valor), 0) / 100;
}

/** Renumera e refaz os percentuais (sobre o total do pedido). */
export function arrumarParcelas(p: ParcelaPedidoMaquina[], total: number): ParcelaPedidoMaquina[] {
  const ordenadas = [...p].sort((a, b) => (a.entrada === b.entrada ? (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0) : a.entrada ? -1 : 1));
  const rec = recalcularPercentuais(
    ordenadas.map((x) => ({ n: x.n, vencimento: x.vencimento, valor: x.valor, percentual: x.percentual, meio: x.meio })),
    total,
  );
  return ordenadas.map((x, i) => ({ ...x, n: rec[i].n, valor: rec[i].valor, percentual: rec[i].percentual }));
}

// ---------------------------------------------------------------------------
// Importar da proposta
// ---------------------------------------------------------------------------
export interface PropostaResumo {
  id: number;
  Cliente?: string | null;
  'Cpf/Cpnj'?: string | null;
  Cidade?: string | null;
  Marca?: string | null;
  Modelo?: string | null;
  Ano?: string | number | null;
  Valor_Total?: string | number | null;
  Condicoes?: string | null;
  Prazo_Entrega?: string | number | null;
  status?: string | null;
  vendedor_id?: number | null;
  vendedor_nome?: string | null;
  criado_em?: string | null;
}

export interface Importacao {
  cliente: { nome: string; documento: string } | null;
  vendedor_id: number | null;
  valor_proposta: number;
  modelo: string;
  parcelas: ParcelaPedidoMaquina[];
  avisos: string[];
}

/** O que a proposta traz para o pedido. `totalPedido` = soma dos itens (0 = sem itens). */
export function importarDaProposta(
  prop: PropostaResumo,
  pagBruto: unknown | null,
  totalPedido: number,
): Importacao {
  const avisos: string[] = [];
  const valorProp = numeroBR(prop.Valor_Total);
  const doc = String(prop['Cpf/Cpnj'] || '').replace(/\D/g, '');
  const pag: PagamentoProposta | null = pagBruto ? normalizarPagamento(pagBruto) : null;

  const parcelas: ParcelaPedidoMaquina[] = [];
  if (pag) {
    if (pag.entrada_valor && pag.entrada_valor > 0) {
      parcelas.push({
        n: 0, vencimento: pag.entrada_data || '', valor: pag.entrada_valor, percentual: 0,
        meio: 'pix', entrada: true, origem_proposta_parcela: 0,
      });
    }
    pag.parcelas.forEach((p, i) => parcelas.push({
      n: 0, vencimento: p.vencimento, valor: p.valor, percentual: p.percentual, meio: p.meio,
      entrada: false, origem_proposta_parcela: i + 1,
    }));
    if (!parcelas.length) avisos.push('A proposta não tem parcelas cadastradas — monte o pagamento no pedido.');
    if (parcelas.some((p) => !p.vencimento)) avisos.push('Há parcela da proposta sem data: preencha antes de enviar.');
  } else {
    avisos.push(prop.Condicoes
      ? `A proposta só tem as condições em texto: "${String(prop.Condicoes).slice(0, 120)}". Monte as parcelas no pedido.`
      : 'A proposta não tem forma de pagamento cadastrada.');
  }

  const base = totalPedido > 0 ? totalPedido : valorProp;
  const soma = parcelas.reduce((s, p) => s + c(p.valor), 0);
  if (parcelas.length && base > 0 && soma !== c(base)) {
    avisos.push(`As parcelas da proposta somam ${(soma / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e o pedido vale ${base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
  }
  if (totalPedido > 0 && valorProp > 0 && c(totalPedido) !== c(valorProp)) {
    avisos.push(`Valor da proposta (${valorProp.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) diferente do total dos itens.`);
  }
  if (prop.status && prop.status !== 'Concluida-Vendido') avisos.push(`A proposta está "${prop.status}", ainda não marcada como vendida.`);

  return {
    cliente: prop.Cliente ? { nome: String(prop.Cliente).trim(), documento: doc } : null,
    vendedor_id: prop.vendedor_id ? Number(prop.vendedor_id) : null,
    valor_proposta: valorProp,
    modelo: [prop.Marca, prop.Modelo, prop.Ano].filter(Boolean).join(' '),
    parcelas: arrumarParcelas(parcelas, base),
    avisos,
  };
}

// ---------------------------------------------------------------------------
// Validação antes de ir à Omie
// ---------------------------------------------------------------------------
export interface PedidoParaValidar {
  status: string;
  cliente?: string | null;
  cliente_documento?: string | null;
  vendedor_id?: number | null;
  pedido_omie?: string | null;
  itens: ItemPedidoMaquina[];
  parcelas: ParcelaPedidoMaquina[];
}

export function validarParaOmie(p: PedidoParaValidar, hojeISO: string): string[] {
  const erros: string[] = [];
  if (p.pedido_omie) erros.push(`Pedido já está na Omie (nº ${p.pedido_omie}).`);
  if (p.status === 'cancelado' || p.status === 'faturado') erros.push('Pedido encerrado.');
  const doc = String(p.cliente_documento || '').replace(/\D/g, '');
  if (!p.cliente || !(doc.length === 11 || doc.length === 14)) erros.push('Cliente com CPF/CNPJ é obrigatório.');
  if (!p.vendedor_id) erros.push('Escolha o vendedor.');
  if (!p.itens.length) erros.push('Inclua ao menos uma máquina ou implemento.');
  if (p.itens.some((i) => !(Number(i.preco) > 0))) erros.push('Há item sem preço.');
  if (p.itens.some((i) => !i.codigo_produto)) erros.push('Há item sem cadastro na Omie (escolha da lista de produtos).');
  const total = totalItens(p.itens);
  if (!p.parcelas.length) erros.push('Monte o pagamento (ao menos uma parcela).');
  else {
    if (c(somaParcelas(p.parcelas)) !== c(total)) erros.push(`As parcelas somam ${somaParcelas(p.parcelas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} e o pedido vale ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`);
    if (p.parcelas.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x.vencimento))) erros.push('Há parcela sem data.');
    else if (p.parcelas.some((x) => x.vencimento < hojeISO)) erros.push('Há parcela vencida (data no passado) — a Omie recusa.');
  }
  return erros;
}

// ---------------------------------------------------------------------------
// Parcelas → Omie (pedido de venda)
// ---------------------------------------------------------------------------
const isoParaBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function diasEntre(deISO: string, ateISO: string): number {
  const a = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10));
  const b = Date.UTC(+ateISO.slice(0, 4), +ateISO.slice(5, 7) - 1, +ateISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Bloco de parcelas do IncluirPedido. À vista hoje = "000"; senão "999" com a lista exata. */
export function parcelasParaOmie(parcelas: ParcelaPedidoMaquina[], total: number, hojeISO: string): {
  codigo_parcela: string; qtde_parcelas: number; lista_parcelas?: { parcela: Record<string, unknown>[] };
} {
  const ord = arrumarParcelas(parcelas, total);
  if (ord.length === 1 && ord[0].vencimento <= hojeISO) return { codigo_parcela: '000', qtde_parcelas: 1 };
  // percentuais fecham 100 na última (a Omie recusa 99,99)
  let acumulado = 0;
  const parcela = ord.map((p, i) => {
    const ultima = i === ord.length - 1;
    const pct = ultima ? Math.round((100 - acumulado) * 100) / 100 : p.percentual;
    acumulado = Math.round((acumulado + pct) * 100) / 100;
    return {
      numero_parcela: i + 1,
      data_vencimento: isoParaBR(p.vencimento),
      quantidade_dias: Math.max(0, diasEntre(hojeISO, p.vencimento)),
      percentual: pct,
      valor: p.valor,
    };
  });
  return { codigo_parcela: '999', qtde_parcelas: parcela.length, lista_parcelas: { parcela } };
}

/** Texto "PVM-0003 · proposta #123" para as observações da NF/pedido. */
export function referenciaPedido(idPedido: string, propostaId?: number | null): string {
  return propostaId ? `${idPedido} · Proposta #${propostaId}` : idPedido;
}
