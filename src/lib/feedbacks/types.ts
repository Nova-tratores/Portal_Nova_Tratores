// Tipos do módulo Feedbacks & CRM. Refletem o schema definido em
// sql/create-feedbacks-module.sql.

export type TipoFeedback = "crm" | "rfm";
export type PrioridadeOportunidade = "Urgente" | "Normal" | "Baixa";
export type StatusOportunidade = "aberta" | "atendida" | "dispensada" | "expirada";
export type RegraOportunidade = "R1_revisao" | "R2_sem_os" | "R3_upsell" | "R4_followup" | "R5_pecas" | "R6_fora_garantia";

export type StatusCliente = "Satisfeito" | "Neutro" | "Insatisfeito" | "Aguardando";
export type NPS = "Sim" | "Talvez" | "Não";
export type Melhoria = "Prazo" | "Atendimento" | "Preço" | "Qualidade Técnica";
export type PrioridadeRFM = "Urgente" | "Normal" | "Inativo";

// Estado do registro quando criado a partir de oportunidade
export type StatusAtendimento = "aberto" | "em_andamento" | "concluido" | "sem_resposta";

export interface Tentativa {
  data: string;          // ISO
  canal: "wpp" | "telefone" | "email" | "outro";
  observacao?: string;
}

export interface FeedbackRegistro {
  id: number;
  tipo: TipoFeedback;
  nome: string;
  telefone: string | null;
  email: string | null;
  trator: string | null;
  tecnico: string | null;
  codigo_omie: string | null;
  data_contato: string | null;
  // CRM-only
  servico: string | null;
  data_servico: string | null;
  status_cliente: StatusCliente | null;
  nota: number | null;
  feedback: string | null;
  nps: NPS | null;
  melhoria: Melhoria | null;
  // RFM-only
  ultimo_servico: string | null;
  motivo: string | null;
  prioridade: PrioridadeRFM | null;
  acao: string | null;
  sem_resposta: boolean;
  revisao_confirmada: string | null;
  tentativas: Tentativa[];

  // Workflow de atendimento
  atendente_id: string | null;
  atendente_nome: string | null;
  aberto_em: string | null;
  concluido_em: string | null;
  status_atendimento: StatusAtendimento;
  origem_dados: string | null;  // "Omie NOVA" | "Omie CASTRO" | "Omie" | "Portal"

  criado_em: string;
  atualizado_em: string;
}

export interface Funcionario {
  nome: string;
  cargo: string;
  telefone: string;
  fazenda: string;
}

export interface Fazenda {
  nome: string;
  cidade: string;
  tratores: string[];
}

export interface ClienteInfo {
  id: number;
  cliente_key: string;     // 'omie_<codigo>' | 'nome_<NOME_UPPER>'
  codigo_omie: string | null;
  nome: string | null;
  cidade: string | null;
  email: string | null;
  funcionarios: Funcionario[];
  fazendas: Fazenda[];
  atualizado_em: string;
}

export interface Oportunidade {
  id: number;
  regra: RegraOportunidade;
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: PrioridadeOportunidade;
  status: StatusOportunidade;
  atendida_por: string | null;
  atendida_em: string | null;
  feedback_id: number | null;
  dispensada_motivo: string | null;
  computado_em: string;
}

export interface ConfigRegra {
  regra: RegraOportunidade;
  parametros: Record<string, unknown>;
  atualizado_em: string;
}

// Cliente da tabela `Clientes` (do Portal, sync Omie)
export interface ClienteOmie {
  id_omie: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  telefone: string | null;
  email: string | null;
}

// Projeto/Equipamento — pode vir de duas fontes:
//   - `Projeto` (sync Omie de projetos)
//   - `tratores` (controle interno do Portal, tem tratores nem sempre presentes no Omie)
// Campo `fonte` distingue pra UI poder indicar origem.
export interface ProjetoOmie {
  id_omie: string;
  Nome_Projeto: string;
  Nome_Cliente?: string | null;
  Codigo_Cliente?: string | null;
  fonte?: "omie" | "portal";
}

// Chave canônica para identificar um cliente em feedback_clientes_info.
// Mesma convenção do app legado.
export function clienteKey(codigoOmie: string | null | undefined, nome: string): string {
  if (codigoOmie) return `omie_${codigoOmie}`;
  return `nome_${(nome || "").trim().toUpperCase()}`;
}
