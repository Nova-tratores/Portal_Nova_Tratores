// =============================================
// CAMADA DE API CLIENT-SIDE TIPADA
// Todas as chamadas ao backend passam por aqui.
// Se a URL base mudar ou precisar de token, muda só aqui.
// =============================================

import type {
  KanbanItem, PPVDetalhes, ClienteBusca, OSBusca,
  ProdutoBusca, DadosIniciais, ItemRevisao, LogEntry,
  DadosProdutoManual,
} from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data as T;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// =============================================
// ENDPOINTS
// =============================================

export const api = {
  // --- Dados Iniciais ---
  getDadosIniciais: () =>
    request<DadosIniciais>("/api/ppv/dados-iniciais"),

  // --- Kanban / Pedidos ---
  listarPedidos: () =>
    request<KanbanItem[]>("/api/ppv/pedidos"),

  buscarPedido: (id: string) =>
    request<PPVDetalhes>(`/api/ppv/pedidos?id=${encodeURIComponent(id)}`),

  criarPedido: (dados: {
    tipoPedido: string; motivoSaida: string; tecnico: string;
    cliente: string; observacao: string; osId: string;
    valorTotal: number; produtosSelecionados: unknown[];
    idExistente?: string; userName?: string; projeto?: string; usarProjetoOS?: boolean;
  }) => post<{ id: string; detalhes: PPVDetalhes }>("/api/ppv/pedidos", dados),

  editarPedido: (dados: {
    id: string; status: string; observacao: string; tecnico: string;
    cliente?: string;
    clienteDocumento?: string; // CNPJ/CPF — identifica o cliente (o nome tem homônimos)
    motivoCancelamento: string; pedidoOmie: string; osId: string;
    tipoPedido: string; motivoSaida: string; userName?: string;
    substitutoTipo?: string | null; substitutoId?: string | null;
    desconto?: number; projeto?: string; usarProjetoOS?: boolean;
  }) => patch<{ success: boolean }>("/api/ppv/pedidos", dados),

  // --- Movimentações ---
  registrarMovimentacao: (dados: {
    id: string; codigo: string; descricao: string; quantidade: number;
    preco: number; tecnico: string; tipoMovimento: string; userName?: string;
  }) => post<PPVDetalhes>("/api/ppv/movimentacoes", dados),

  editarPrecoItem: (id: string, codigo: string, preco: number, userName?: string) =>
    patch<PPVDetalhes>("/api/ppv/movimentacoes", { id, codigo, preco, userName }),

  // Importa um kit inteiro numa só chamada (marca os itens com o rótulo do kit)
  importarKitLote: (dados: {
    id: string; kit: string; tecnico: string; userName?: string;
    itens: { codigo: string; descricao: string; quantidade: number; preco: number }[];
  }) => post<PPVDetalhes>("/api/ppv/movimentacoes", dados),

  // Remove o kit inteiro (devolve todos os itens dele de uma vez)
  removerKit: (id: string, kit: string, userName?: string) =>
    request<PPVDetalhes>("/api/ppv/movimentacoes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, kit, userName }) }),

  // --- Busca de Clientes ---
  buscarClientes: (termo: string) =>
    request<ClienteBusca[]>(`/api/ppv/clientes?termo=${encodeURIComponent(termo)}`),

  buscarClientePorNome: (nome: string) =>
    request<{ documento: string; endereco: string; cidade: string }>(`/api/ppv/cliente-dados?nome=${encodeURIComponent(nome)}`),

  // Busca pelo DOCUMENTO — é o certo quando há homônimos (nome não identifica o cliente).
  buscarClientePorDocumento: (documento: string) =>
    request<{ nome: string; documento: string; endereco: string; cidade: string }>(`/api/ppv/cliente-dados?documento=${encodeURIComponent(documento)}`),

  // --- Busca de OS ---
  buscarOS: (termo: string) =>
    request<OSBusca[]>(`/api/ppv/ordens-servico?termo=${encodeURIComponent(termo)}`),

  listarOSAbertas: () =>
    request<OSBusca[]>("/api/ppv/ordens-servico?abertas=1"),

  // --- Busca de Produtos ---
  buscarProdutos: (termo: string) =>
    request<ProdutoBusca[]>(`/api/ppv/produtos?termo=${encodeURIComponent(termo)}`),

  salvarProdutoManual: (dados: DadosProdutoManual) =>
    post<{ success: boolean }>("/api/ppv/produtos", dados),

  editarPrecoProduto: (codigo: string, preco: number, empresa?: string) =>
    patch<{ success: boolean }>("/api/ppv/produtos", { codigo, preco, empresa }),

  // --- Revisões / Kit ---
  buscarKitRevisao: (trator: string, horas: string) =>
    request<ItemRevisao[]>(`/api/ppv/revisoes?trator=${encodeURIComponent(trator)}&horas=${encodeURIComponent(horas)}`),

  // --- Logs / Histórico ---
  buscarHistorico: (id: string) =>
    request<LogEntry[]>(`/api/ppv/logs?id=${encodeURIComponent(id)}`),

  // --- PDF ---
  gerarPDF: (id: string) =>
    request<{ html: string }>(`/api/ppv/pdf?id=${encodeURIComponent(id)}`),

  // --- Omie ---
  enviarParaOmie: (id: string, userName?: string) =>
    post<{ success: boolean; numeroPedido: string }>("/api/ppv/pedidos/omie", { id, userName }),
};
