// =============================================================================
// MARKETING & EVENTOS — tipos e constantes.
//
// Espelha os CHECK da migration sql/marketing-acoes.sql. Se mudar um valor aqui
// SEM mudar o CHECK no banco, o insert falha em runtime — os dois andam juntos.
//
// A "AÇÃO DE MARKETING" é a entidade guarda-chuva: feira é um TIPO.
// =============================================================================

// ── Ação ─────────────────────────────────────────────────────────────────────
export const TIPOS_ACAO = [
  { id: 'feira',        label: 'Feira' },
  { id: 'dia_de_campo', label: 'Dia de campo' },
  { id: 'acao_loja',    label: 'Ação de loja' },
  { id: 'patrocinio',   label: 'Patrocínio' },
  { id: 'midia',        label: 'Mídia / publicidade' },
  { id: 'brinde',       label: 'Brindes' },
  { id: 'outro',        label: 'Outro' },
] as const;

export const STATUS_ACAO = [
  { id: 'planejada',    label: 'Planejada',    cor: '#64748b' },
  { id: 'aprovada',     label: 'Aprovada',     cor: '#2563eb' },
  { id: 'em_andamento', label: 'Em andamento', cor: '#16a34a' },
  { id: 'realizada',    label: 'Realizada',    cor: '#7c3aed' },
  { id: 'cancelada',    label: 'Cancelada',    cor: '#dc2626' },
] as const;

export const EMPRESAS = ['NOVA', 'CASTRO'] as const;

// ── Apoio de fábrica (verba co-op) ───────────────────────────────────────────
export const TIPOS_APOIO = [
  { id: 'verba',    label: 'Verba (dinheiro)' },
  { id: 'produto',  label: 'Produto' },
  { id: 'material', label: 'Material / brinde' },
  { id: 'servico',  label: 'Serviço' },
  { id: 'outro',    label: 'Outro' },
] as const;

/** A ordem é a linha do tempo do processo — a UI desenha o caminho nesta ordem. */
export const STATUS_APOIO = [
  { id: 'pleiteado',   label: 'Pleiteado',   cor: '#64748b', etapa: 1 },
  { id: 'aprovado',    label: 'Aprovado',    cor: '#2563eb', etapa: 2 },
  { id: 'documentado', label: 'Documentado', cor: '#0891b2', etapa: 3 },
  { id: 'faturado',    label: 'Faturado',    cor: '#d97706', etapa: 4 },
  { id: 'recebido',    label: 'Recebido',    cor: '#16a34a', etapa: 5 },
  { id: 'recusado',    label: 'Recusado',    cor: '#dc2626', etapa: 0 },
  { id: 'cancelado',   label: 'Cancelado',   cor: '#78716c', etapa: 0 },
] as const;

export const DOCUMENTOS_APOIO = ['NF', 'ND', 'OC', 'outro'] as const;

export const STATUS_RELATORIO = [
  { id: 'pendente',      label: 'Pendente',      cor: '#dc2626' },
  { id: 'em_elaboracao', label: 'Em elaboração', cor: '#d97706' },
  { id: 'enviado',       label: 'Enviado',       cor: '#2563eb' },
  { id: 'aceito',        label: 'Aceito',        cor: '#16a34a' },
  { id: 'recusado',      label: 'Recusado',      cor: '#991b1b' },
] as const;

/** Relatório ainda devido à fábrica — é o que entra no alerta de prazo. */
export const RELATORIO_EM_ABERTO = ['pendente', 'em_elaboracao'] as const;

// ── Custos ───────────────────────────────────────────────────────────────────
export const CATEGORIAS_CUSTO = [
  { id: 'estande',     label: 'Estande' },
  { id: 'locacao',     label: 'Locação de espaço' },
  { id: 'montagem',    label: 'Montagem / desmontagem' },
  { id: 'transporte',  label: 'Transporte de máquinas' },
  { id: 'hospedagem',  label: 'Hospedagem' },
  { id: 'alimentacao', label: 'Alimentação' },
  { id: 'pessoal',     label: 'Pessoal / diárias' },
  { id: 'brinde',      label: 'Brindes' },
  { id: 'impresso',    label: 'Gráfica / impressos' },
  { id: 'midia',       label: 'Mídia / publicidade' },
  { id: 'patrocinio',  label: 'Patrocínio' },
  { id: 'frete',       label: 'Frete' },
  { id: 'combustivel', label: 'Combustível' },
  { id: 'outro',       label: 'Outro' },
] as const;

export const ORIGENS_CUSTO = [
  { id: 'manual',       label: 'Digitado' },
  { id: 'requisicao',   label: 'Requisição' },
  { id: 'finan_pagar',  label: 'Conta a pagar' },
  { id: 'nota_entrada', label: 'Nota de entrada' },
] as const;

/** Vínculos aceitos pelo CHECK de mkt_custos (o 'manual' não é vínculo). */
export const VINCULOS_CUSTO = ['requisicao', 'finan_pagar', 'nota_entrada'] as const;

export const STATUS_CUSTO = [
  { id: 'previsto',   label: 'Previsto',   cor: '#d97706' },
  { id: 'confirmado', label: 'Confirmado', cor: '#16a34a' },
  { id: 'cancelado',  label: 'Cancelado',  cor: '#dc2626' },
] as const;

// ── Leads ────────────────────────────────────────────────────────────────────
export const QUALIFICACOES_LEAD = [
  { id: 'novo',        label: 'Novo',           cor: '#64748b' },
  { id: 'em_contato',  label: 'Em contato',     cor: '#2563eb' },
  { id: 'qualificado', label: 'Qualificado',    cor: '#0891b2' },
  { id: 'proposta',    label: 'Virou proposta', cor: '#7c3aed' },
  { id: 'ganho',       label: 'Ganho',          cor: '#16a34a' },
  { id: 'perdido',     label: 'Perdido',        cor: '#dc2626' },
  { id: 'descartado',  label: 'Descartado',     cor: '#78716c' },
] as const;

/** Lead que já "andou" — base da taxa de conversão. */
export const LEAD_QUALIFICADO = ['qualificado', 'proposta', 'ganho'] as const;

export const TEMPERATURAS = [
  { id: 'quente', label: 'Quente', cor: '#dc2626' },
  { id: 'morno',  label: 'Morno',  cor: '#d97706' },
  { id: 'frio',   label: 'Frio',   cor: '#2563eb' },
] as const;

// ── Equipe / itens / realizadas / mídia ──────────────────────────────────────
export const PAPEIS_EQUIPE = [
  { id: 'responsavel', label: 'Responsável' },
  { id: 'apoio',       label: 'Apoio' },
  { id: 'vendedor',    label: 'Vendedor' },
  { id: 'tecnico',     label: 'Técnico' },
  { id: 'marketing',   label: 'Marketing' },
  { id: 'externo',     label: 'Externo / terceiro' },
] as const;

export const TIPOS_ITEM = [
  { id: 'trator',        label: 'Trator' },
  { id: 'implemento',    label: 'Implemento' },
  { id: 'peca',          label: 'Peça' },
  { id: 'autopropelido', label: 'Autopropelido' },
  { id: 'servico',       label: 'Serviço' },
  { id: 'outro',         label: 'Outro' },
] as const;

export const DESTINOS_ITEM = [
  { id: 'exposicao',    label: 'Exposição' },
  { id: 'demonstracao', label: 'Demonstração' },
  { id: 'venda',        label: 'Venda' },
  { id: 'brinde',       label: 'Brinde' },
  { id: 'consumo',      label: 'Consumo' },
] as const;

export const TIPOS_REALIZADA = [
  { id: 'atividade',     label: 'Atividade' },
  { id: 'contrapartida', label: 'Contrapartida' },
  { id: 'divulgacao',    label: 'Divulgação' },
  { id: 'brinde',        label: 'Brinde' },
  { id: 'palestra',      label: 'Palestra' },
  { id: 'demonstracao',  label: 'Demonstração' },
  { id: 'outro',         label: 'Outro' },
] as const;

export const TIPOS_MIDIA = [
  { id: 'foto',      label: 'Foto' },
  { id: 'video',     label: 'Vídeo' },
  { id: 'post',      label: 'Post em rede' },
  { id: 'clipping',  label: 'Imprensa' },
  { id: 'banner',    label: 'Banner / peça gráfica' },
  { id: 'documento', label: 'Documento' },
  { id: 'outro',     label: 'Outro' },
] as const;

export const REPETIR_OPCOES = [
  { id: 'sim',              label: 'Sim, do mesmo jeito' },
  { id: 'sim_com_ajustes',  label: 'Sim, com ajustes' },
  { id: 'nao',              label: 'Não' },
  { id: 'indeciso',         label: 'Ainda não sei' },
] as const;

// =============================================================================
// STATUS DO COMERCIAL — literais EXATOS da tabela "Formulario".
// NÃO redigitar em outro lugar: repare no espaço depois do hífen e no ponto
// final do "não vendido". Um typo aqui zera a receita atribuída sem erro
// nenhum aparecer na tela.
// =============================================================================
export const PROPOSTA_VENDIDA = 'Concluida-Vendido';
export const PROPOSTA_PERDIDA = 'Concluida- Não vendido.';
/** Propostas ainda vivas (não concluídas) — o pipeline em aberto da ação. */
export const PROPOSTA_EM_ABERTO = [
  'Enviar Proposta',
  'AGUARDANDO RESPOSTA CLIENTE',
  'AGUARDANDO RESPOSTA BANCO',
] as const;

// ── Types ────────────────────────────────────────────────────────────────────
export type TipoAcao        = (typeof TIPOS_ACAO)[number]['id'];
export type StatusAcao      = (typeof STATUS_ACAO)[number]['id'];
export type Empresa         = (typeof EMPRESAS)[number];
export type TipoApoio       = (typeof TIPOS_APOIO)[number]['id'];
export type StatusApoio     = (typeof STATUS_APOIO)[number]['id'];
export type StatusRelatorio = (typeof STATUS_RELATORIO)[number]['id'];
export type CategoriaCusto  = (typeof CATEGORIAS_CUSTO)[number]['id'];
export type OrigemCusto     = (typeof ORIGENS_CUSTO)[number]['id'];
export type VinculoCusto    = (typeof VINCULOS_CUSTO)[number];
export type StatusCusto     = (typeof STATUS_CUSTO)[number]['id'];
export type QualificacaoLead = (typeof QUALIFICACOES_LEAD)[number]['id'];

export interface Acao {
  id: string;
  codigo: string | null;
  nome: string;
  tipo: TipoAcao;
  status: StatusAcao;
  empresa: Empresa;
  descricao: string | null;
  objetivo: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  local_nome: string | null;
  cidade: string | null;
  uf: string | null;
  projeto_codigo: number | null;
  projeto_nome: string | null;
  projeto_empresa: string | null;
  orcamento_previsto: number | null;
  meta_leads: number | null;
  meta_vendas: number | null;
  meta_receita: number | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_email: string | null;
  publico_estimado: number | null;
  observacoes: string | null;
  criado_por_id: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
  deleted_at: string | null;
}

export interface Apoio {
  id: string;
  acao_id: string;
  apoiador: string;
  tipo: TipoApoio;
  descricao: string | null;
  valor_previsto: number | null;
  valor_aprovado: number | null;
  valor_recebido: number | null;
  status: StatusApoio;
  processo_numero: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  documento_emitido_em: string | null;
  documento_url: string | null;
  previsao_credito: string | null;
  credito_em: string | null;
  forma_credito: string | null;
  contrapartida_texto: string | null;
  contrapartida_prazo: string | null;
  relatorio_status: StatusRelatorio;
  relatorio_enviado_em: string | null;
  relatorio_enviado_para: string[];
  relatorio_url: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Custo {
  id: string;
  acao_id: string;
  descricao: string;
  categoria: CategoriaCusto;
  fornecedor: string | null;
  data: string | null;
  vinculo_tipo: VinculoCusto | null;
  vinculo_ref: string | null;
  vinculo_label: string | null;
  origem: OrigemCusto;
  valor: number;
  valor_fonte: number | null;
  sincronizado_em: string | null;
  rateio_percent: number;
  status: StatusCusto;
  observacoes: string | null;
  anexo_url: string | null;
  criado_em: string;
}

export interface Lead {
  id: string;
  acao_id: string;
  texto: string;
  nome: string | null;
  telefone: string | null;
  telefone_norm: string | null;
  cidade: string | null;
  interesse: string | null;
  foto_url: string | null;
  cliente_cod_cli: number | null;
  cliente_empresa: Empresa | null;
  cliente_nome: string | null;
  qualificacao: QualificacaoLead;
  temperatura: string | null;
  responsavel_nome: string | null;
  proximo_contato: string | null;
  observacoes: string | null;
  capturado_em: string;
  capturado_por_nome: string | null;
}

/** Proposta vinculada, já achatada com o que o ROI precisa. */
export interface PropostaVinculada {
  proposta_id: number;
  peso: number;
  status: string | null;
  valor_total: unknown; // vem cru de "Formulario".Valor_Total — parse no roi.ts
  cliente: string | null;
  vendedor_nome: string | null;
  criado_em: string | null;
}

// ── Helpers de rótulo (usados na tela e no PDF) ──────────────────────────────
type Opcao = { readonly id: string; readonly label: string; readonly cor?: string };

export function rotulo(lista: readonly Opcao[], id: string | null | undefined): string {
  if (!id) return '';
  return lista.find((o) => o.id === id)?.label ?? id;
}

export function cor(lista: readonly Opcao[], id: string | null | undefined, padrao = '#64748b'): string {
  if (!id) return padrao;
  return lista.find((o) => o.id === id)?.cor ?? padrao;
}
