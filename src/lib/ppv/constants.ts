// =============================================
// CONFIGURAÇÕES E CONSTANTES DO SISTEMA PPV
// =============================================

// Nomes das Tabelas
export const TBL_PEDIDOS = "pedidos";
export const TBL_ITENS = "movimentacoes";
export const TBL_PRODUTOS = "Produtos_Completos";
export const TBL_PRODUTOS_MANUAIS = "Produtos_Manuais";
export const TBL_CLIENTES = "Clientes";
export const TBL_CLIENTES_MANUAIS = "Clientes_Manuais";
export const TBL_TECNICOS = "Tecnicos_Appsheet";
export const TBL_REVISOES = "revisoes";
export const TBL_OS = "Ordem_Servico";
export const TBL_LOGS = "logs_ppv";

// Tipos de Movimento (evita magic strings)
export const MOV_SAIDA = "Saída";
export const MOV_DEVOLUCAO = "Devolução";

// Cores dos Status
export const STATUS_COLORS = {
  Aguardando: { text: "#C2410C", bg: "#FFF7ED" },
  "Em Andamento": { text: "#1D4ED8", bg: "#EFF6FF" },
  "Aguardando Para Faturar": { text: "#8B5CF6", bg: "#F5F3FF" },
  Fechado: { text: "#047857", bg: "#ECFDF5" },
  Cancelado: { text: "#B91C1C", bg: "#FEF2F2" },
} as const;

export type StatusKey = keyof typeof STATUS_COLORS;

// Opções de Select
export const TIPOS_PEDIDO = [
  { value: "Pedido", label: "Pedido de Venda (PPV)" },
  { value: "Remessa", label: "Remessa (REM)" },
];

export const MOTIVOS_SAIDA = [
  { value: "Venda Balcão", label: "Venda Balcão" },
  { value: "Orçamento Cliente", label: "Orçamento Cliente" },
  { value: "Saida Tecnico (Sem OS)", label: "Saída Técnico (Sem OS)" },
  { value: "Saida Tecnico (Com OS)", label: "Saída Técnico (Com OS)" },
];

export const STATUS_OPTIONS = [
  { value: "Aguardando", label: "Aguardando" },
  { value: "Em Andamento", label: "Em Andamento" },
  { value: "Aguardando Para Faturar", label: "Aguardando Para Faturar" },
  { value: "Fechado", label: "Fechado" },
  { value: "Cancelado", label: "Cancelado" },
];
