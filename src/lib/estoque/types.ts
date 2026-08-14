// Tipos de retorno das rotas do módulo Estoque (compartilhados front/back).
import type { Conta } from './conta';

export interface VendaItem {
  numero: string;
  data: string;
  qtd: number;
  vu: number;
  vt: number;
  codCliente: string;
  cliente?: string;
  vendedor?: string;
}

export interface CompraItem {
  data: string;
  nf: string;
  qtd: number;
  vu: number;
  vt: number;
  fornecedor: string;
}

export interface VendasPeriodos {
  ma: { p: string; q: number };
  mant: { p: string; q: number };
  maaa: { p: string; q: number };
  mantaa: { p: string; q: number };
}

export interface BuscarResult {
  produto: {
    codigo: string;
    descricao: string;
    familia: string;
    marca: string;
    valor_venda: number;
    codigo_produto: number;
  };
  estoque: {
    cmc: number | string;
    saldo: number | string;
    fisico: number | string;
    pendente: number | string;
    reservado: number | string;
    est_min: number | string;
  };
  vendas: VendasPeriodos;
  vendasLista: VendaItem[];
  compras: CompraItem[];
}

export interface HistoricoPonto {
  periodo: string;
  mes: number;
  ano: number;
  cmc: number;
  venda: number;
  margem: number;
}

export interface CmcPonto {
  periodo: string;
  mes: number;
  ano: number;
  cmc: number;
  fonte?: 'cache' | 'api' | 'erro';
}

export interface ProdutoDetalheResult {
  produto: {
    codigo: string;
    descricao: string;
    familia: string;
    marca: string;
    ncm: string;
    ean: string;
    unidade: string;
    tipo_item: string;
    peso_bruto: number;
    peso_liq: number;
    altura: number;
    largura: number;
    profundidade: number;
    valor_unitario: number;
    codigo_produto: number;
    observacoes: string;
    tipo: string;
    caracteristicas: Array<{ nome: string; conteudo: string }>;
  };
  estoque: {
    cmc: number;
    saldo: number;
    fisico: number;
    pendente: number;
    reservado: number;
    est_min: number;
  };
  custos: {
    preco_compra: number;
    preco_custo_medio: number;
    preco_venda: number;
    margem_bruta_pct: number;
    margem_bruta_rs: number;
    ultima_compra_data: string;
    ultima_venda_data: string;
    ultima_venda_valor: number;
  };
  vendas: VendasPeriodos;
  vendasLista: VendaItem[];
  compras: CompraItem[];
  historicoProduto: HistoricoPonto[];
}

export type { Conta };
