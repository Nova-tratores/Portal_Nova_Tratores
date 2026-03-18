// =============================================
// TIPOS DO SISTEMA PPV
// =============================================

export interface KanbanItem {
  id: string;
  cliente: string;
  tecnico: string;
  tipo: string;
  status: string;
  valor: number;
  data: string;
  observacao: string;
}

export interface ProdutoSelecionado {
  codigo: string;
  descricao: string;
  preco: number;
  quantidade: number;
  subtotal: number;
  empresa?: string;
}

export interface ProdutoBusca {
  id_manual?: number;
  codigo: string;
  descricao: string;
  preco: number;
  origem: "completos" | "manuais";
  empresa?: string;
}

export interface ClienteBusca {
  nome: string;
  documento: string;
  endereco: string;
  cidade: string;
  origem: "OMIE" | "MANUAL";
}

export interface OSBusca {
  id: string;
  cliente: string;
  status: string;
  servSolicitado: string;
}

export interface ProdutoDetalhe {
  codigo: string;
  descricao: string;
  quantidade: number;
  preco: number;
  empresa?: string;
}

export interface Devolucao {
  codigo: string;
  descricao: string;
  quantidade: number;
  preco: number;
}

export interface PPVDetalhes {
  id: string;
  cliente: string;
  tecnico: string;
  status: string;
  data: string;
  valor: number;
  observacao: string;
  motivoCancelamento: string;
  motivoSaida: string;
  pedidoOmie: string;
  usuEmail: string;
  osId: string;
  tipoPedido: string;
  produtos: ProdutoDetalhe[];
  devolucoes: Devolucao[];
}

export interface DadosIniciais {
  tecnicos: string[];
  opcoesRevisao: Record<string, string[]>;
}

export interface ItemRevisao {
  codigo: string;
  descricao: string;
  quantidade: number;
  preco: number;
}

export interface LogEntry {
  data_hora: string;
  acao: string;
  usuario_email: string;
}

export interface DadosFormulario {
  tipoPedido: string;
  motivoSaida: string;
  osId: string;
  tecnico: string;
  cliente: string;
  observacao: string;
  valorTotal: number;
  produtosSelecionados: ProdutoSelecionado[];
}

export interface DadosEdicao {
  id: string;
  status: string;
  observacao: string;
  tecnico: string;
  cliente: string;
  motivoCancelamento: string;
  pedidoOmie: string;
  osId: string;
  tipoPedido: string;
  motivoSaida: string;
}

export interface DadosMovimentacao {
  id: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  preco: number;
  tecnico: string;
  cliente?: string;
}

export interface DadosProdutoManual {
  id?: string;
  codigo: string;
  descricao: string;
  preco: number;
}

export interface DadosImpressao {
  id: string;
  tipo: string;
  data: string;
  cliente: string;
  tecnico: string;
  motivo: string;
  os: string;
  pedidoOmie: string;
  obs: string;
  itens: ItemImpressao[];
  totalDev: string;
  totalFinal: string;
}

export interface ItemImpressao {
  codigo: string;
  descricao: string;
  saida: number;
  devStr: string;
  ficou: number;
  unit: string;
  total: string;
}
