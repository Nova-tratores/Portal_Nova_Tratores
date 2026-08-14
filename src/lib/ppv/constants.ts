// =============================================
// CONFIGURAÇÕES E CONSTANTES DO SISTEMA PPV
// =============================================

// Nomes das Tabelas
export const TBL_PEDIDOS = "pedidos";
export const TBL_ITENS = "movimentacoes";
export const TBL_PRODUTOS = "Produtos_Completos";
export const TBL_PRODUTOS_MANUAIS = "Produtos_Manuais";
export const TBL_CLIENTES = "portal_nt_clientes_PRINCIPAL";
export const TBL_CLIENTES_MANUAIS = "Clientes_Manuais";
export const TBL_TECNICOS = "Tecnicos_Appsheet";
export const TBL_REVISOES = "revisoes";
export const TBL_OS = "Ordem_Servico";
export const TBL_LOGS = "logs_ppv";

// Tipos de Movimento (evita magic strings)
export const MOV_SAIDA = "Saída";
export const MOV_DEVOLUCAO = "Devolução";

// Cores dos Status — mesmas fases do POS
export const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  "Orçamento": { text: "#B45309", bg: "#FFFBEB" },
  "Orçamento enviado para o cliente e aguardando": { text: "#C2410C", bg: "#FFF7ED" },
  "Execução": { text: "#1D4ED8", bg: "#EFF6FF" },
  "Execução (Realizando Diagnóstico)": { text: "#0369A1", bg: "#F0F9FF" },
  "Execução aguardando peças (em transporte)": { text: "#6D28D9", bg: "#F5F3FF" },
  "Executada aguardando comercial": { text: "#7C3AED", bg: "#FAF5FF" },
  "Aguardando outros": { text: "#CA8A04", bg: "#FEFCE8" },
  "Aguardando ordem Técnico": { text: "#D97706", bg: "#FFF7ED" },
  "Relatório Concluído": { text: "#0891B2", bg: "#ECFEFF" },
  "Enviado Omie": { text: "#C2570A", bg: "#FFF3E6" },
  "Concluída": { text: "#047857", bg: "#ECFDF5" },
  "Cancelada": { text: "#B91C1C", bg: "#FEF2F2" },
};

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
  { value: "Orçamento", label: "Orçamento" },
  { value: "Orçamento enviado para o cliente e aguardando", label: "Orçamento enviado" },
  { value: "Execução", label: "Execução" },
  { value: "Execução (Realizando Diagnóstico)", label: "Realizando Diagnóstico" },
  { value: "Execução aguardando peças (em transporte)", label: "Aguardando peças" },
  { value: "Executada aguardando comercial", label: "Aguardando comercial" },
  { value: "Aguardando outros", label: "Aguardando outros" },
  { value: "Aguardando ordem Técnico", label: "Aguardando técnico" },
  { value: "Relatório Concluído", label: "Relatório Concluído" },
  { value: "Enviado Omie", label: "Enviado Omie" },
  // Valor continua "Concluída" (usado na lógica de faturamento/sync); rótulo = "Faturado".
  { value: "Concluída", label: "Faturado" },
  { value: "Cancelada", label: "Cancelada" },
];

// Rótulo de exibição de um status (o valor cru continua o mesmo na lógica/DB).
export function rotuloStatus(value: string): string {
  return STATUS_OPTIONS.find((o) => o.value === value)?.label || value;
}
