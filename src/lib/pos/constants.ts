// Tabelas Supabase
export const TBL_OS = "Ordem_Servico";
export const TBL_CLIENTES = "Clientes";
export const TBL_CLIENTES_MANUAIS = "Clientes_Manuais";
export const TBL_TECNICOS = "Tecnicos_Appsheet";
export const TBL_ITENS = "movimentacoes";
export const TBL_PROJETOS_DB = "Projeto";
export const TBL_LOGS_PPO = "logs_ppo";
export const TBL_LOGS_PPV = "logs_ppv";
export const TBL_PEDIDOS = "pedidos";
export const TBL_REQ_SOL = "Solicitacao_Requisicao";
export const TBL_REQ_ATT = "Atualizar_Req";
export const TBL_REV_PRONTAS = "Revisoes_Pronta";
export const TBL_METRICAS = "tecnico_metricas";
export const TBL_LEMBRETES = "lembretes_clientes";

// Mapa de status POS → PPV (1:1, PPV acompanha POS)
export const POS_TO_PPV_STATUS: Record<string, string> = {
  "Orçamento": "Orçamento",
  "Orçamento enviado para o cliente e aguardando": "Orçamento enviado para o cliente e aguardando",
  "Execução": "Execução",
  "Execução (Realizando Diagnóstico)": "Execução (Realizando Diagnóstico)",
  "Execução aguardando peças (em transporte)": "Execução aguardando peças (em transporte)",
  "Relatório Atualizado": "Relatório Atualizado",
  "Executada aguardando comercial": "Executada aguardando comercial",
  "Aguardando outros": "Aguardando outros",
  "Aguardando ordem Técnico": "Aguardando ordem Técnico",
  "Relatório Concluído": "Relatório Concluído",
  "Concluída": "Concluída",
  "Cancelada": "Cancelada",
};

// Valores
export const VALOR_HORA = 193.0;
export const VALOR_KM = 2.8;

// Fases do Kanban
export const PHASES = [
  "Orçamento",
  "Orçamento enviado para o cliente e aguardando",
  "Execução",
  "Execução (Realizando Diagnóstico)",
  "Execução aguardando peças (em transporte)",
  "Relatório Atualizado",
  "Executada",
  "Executada aguardando comercial",
  "Aguardando outros",
  "Aguardando ordem Técnico",
  "Relatório Concluído",
  "Concluída",
  "Cancelada",
];

// Fases que pausam o contador de métricas do técnico
export const FASES_CONTADOR_PARADO = new Set([
  "Relatório Concluído",
  "Concluída",
  "Cancelada",
]);

// Template de descrição
export const TEXT_TEMPLATE =
  "Modelo: \nChassis: \nHorimetro: \n\nSolicitação do cliente: \nServiço Realizado: ";
