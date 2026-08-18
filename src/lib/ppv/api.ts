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
import { authHeaders } from "@/lib/auth/client";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data as T;
}

// Chamadas autenticadas (rotas que exigem login no servidor — ex.: faturamento).
async function postAuth<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
}
async function getAuth<T>(url: string): Promise<T> {
  return request<T>(url, { headers: { ...(await authHeaders()) } });
}

// Tipos do faturamento (NF-e)
export interface CategoriaFat { codigo: string; empresa: string; descricao: string | null; ativo: boolean; ordem: number }
export interface PrevisaoFat {
  ok: boolean; jaFaturado?: boolean; etapaAtual?: string; categoriaAtual?: string | null;
  total?: number; empresa?: string;
  itens?: Array<{ descricao: string; quantidade: number; valorUnitario: number; valorTotal: number }>;
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
    categoriaPedido?: string; contaCorrente?: string; cenarioFiscal?: string;
    previsaoFaturamento?: string; numParcelas?: string; numContrato?: string;
    contato?: string; dadosNF?: string; consumoFinal?: boolean;
    departamentos?: { codigo: string; perc: number }[];
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
    request<{ documento: string; endereco: string; cidade: string; telefone: string; email: string }>(`/api/ppv/cliente-dados?nome=${encodeURIComponent(nome)}`),

  // Busca pelo DOCUMENTO — é o certo quando há homônimos (nome não identifica o cliente).
  buscarClientePorDocumento: (documento: string) =>
    request<{ nome: string; documento: string; endereco: string; cidade: string; telefone: string; email: string }>(`/api/ppv/cliente-dados?documento=${encodeURIComponent(documento)}`),

  // --- Busca de OS ---
  buscarOS: (termo: string) =>
    request<OSBusca[]>(`/api/ppv/ordens-servico?termo=${encodeURIComponent(termo)}`),

  listarOSAbertas: () =>
    request<OSBusca[]>("/api/ppv/ordens-servico?abertas=1"),

  // --- Busca de Produtos ---
  buscarProdutos: (termo: string) =>
    request<ProdutoBusca[]>(`/api/ppv/produtos?termo=${encodeURIComponent(termo)}`),

  produtosMaisUsados: () =>
    request<{ codigo: string; descricao: string; preco: number; usos: number }[]>("/api/ppv/produtos/mais-usados"),

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

  // Cancela o pedido no Omie (CancelarPedidoVenda) + marca a PPV como Cancelada.
  cancelarPedido: (id: string, motivo: string, userName?: string) =>
    postAuth<{ success: boolean; empresa?: string }>("/api/ppv/pedidos/cancelar", { id, motivo, userName }),

  // --- Faturamento (NF-e) — rotas autenticadas ---
  simularFaturamento: (id: string) =>
    postAuth<PrevisaoFat>("/api/ppv/pedidos/faturar/simular", { id }),

  faturar: (id: string, categoria: string, userName?: string) =>
    postAuth<{ success: boolean; pendente?: boolean; aguardandoSefaz?: boolean; numeroPedido: string; nfNumero: string | null; etapa?: string; empresa: string; error?: string }>(
      "/api/ppv/pedidos/faturar", { id, categoria, userName }),

  // --- Categorias de faturamento (gerenciamento) ---
  listarCategoriasFat: (empresa: string, all = false) =>
    getAuth<{ categorias: CategoriaFat[] }>(`/api/ppv/faturamento-categorias?empresa=${encodeURIComponent(empresa)}${all ? "&all=1" : ""}`),

  salvarCategoriaFat: (c: { codigo: string; empresa: string; descricao?: string; ativo?: boolean; ordem?: number }) =>
    postAuth<{ ok: boolean }>("/api/ppv/faturamento-categorias", { action: "salvar", ...c }),

  excluirCategoriaFat: (codigo: string, empresa: string) =>
    postAuth<{ ok: boolean }>("/api/ppv/faturamento-categorias", { action: "excluir", codigo, empresa }),

  sincronizarCategoriasFat: (empresa: string) =>
    postAuth<{ ok: boolean; total: number }>("/api/ppv/faturamento-categorias", { action: "sincronizar", empresa }),

  // --- Anexos (mídia) + comentários ---
  listarAnexos: (id: string) =>
    request<{ anexos: PPVAnexo[] }>(`/api/ppv/anexos?id=${encodeURIComponent(id)}`),
  addComentario: (id: string, comentario: string, autor?: string) =>
    post<{ ok: boolean }>("/api/ppv/anexos", { id, comentario, autor }),
  addMidia: (id: string, file: File, autor?: string) => {
    const fd = new FormData();
    fd.append("id", id); if (autor) fd.append("autor", autor); fd.append("file", file);
    return request<{ ok: boolean; url: string }>("/api/ppv/anexos", { method: "POST", body: fd });
  },
  delAnexo: (anexoId: number) =>
    request<{ ok: boolean }>(`/api/ppv/anexos?anexoId=${anexoId}`, { method: "DELETE" }),
};

export interface PPVAnexo {
  id: number; id_pedido: string; tipo: "midia" | "comentario";
  url: string | null; nome_arquivo: string | null; comentario: string | null;
  autor: string | null; created_at: string;
}
