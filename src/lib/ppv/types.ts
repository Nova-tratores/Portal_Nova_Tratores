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
  desconto: number;
  data: string;
  observacao: string;
  ultimaAcao: string;
  ultimoUsuario: string;
  ultimaData: string;
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
  clienteDocumento?: string; // CNPJ/CPF — é o que identifica o cliente (o nome tem homônimos)
  tecnico: string;
  status: string;
  data: string;
  valor: number;
  desconto: number;
  observacao: string;
  motivoCancelamento: string;
  substitutoTipo: string | null;
  substitutoId: string | null;
  motivoSaida: string;
  pedidoOmie: string;
  usuEmail: string;
  osId: string;
  tipoPedido: string;
  projeto: string;
  produtos: ProdutoDetalhe[];
  devolucoes: Devolucao[];
  kits?: KitImportado[];
}

// Kit importado num PPV (agrupa os itens que entraram juntos), para remover o kit inteiro.
export interface KitImportado {
  tag: string;      // "rótulo§batchId" — identifica esta importação
  rotulo: string;   // ex.: "Revisão 300H · 6075"
  itens: { codigo: string; descricao: string; quantidade: number; preco: number }[];
  total: number;
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
  projeto: string;
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
  projeto: string;
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
