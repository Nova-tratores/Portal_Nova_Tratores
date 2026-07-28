// Tipos do módulo de Garantias

export type GarantiaStatus =
  | 'aberta'
  | 'em_analise'
  | 'bo_tecnico'
  | 'enviada'
  | 'info_pendente'
  | 'aguardando_servico'      // duas etapas: peças aprovadas, esperando o serviço
  | 'ressarcimento_fabrica'   // duas etapas: ressarcimento de horas/km na fábrica
  | 'aprovada'
  | 'rejeitada';

export type GarantiaResultado = 'aprovada' | 'rejeitada';

// Cobrança ao cliente quando a garantia é rejeitada.
export type CobrancaStatus =
  | 'nao_aplicavel'    // garantia não rejeitada
  | 'nao_cobrar'       // garantista decidiu cortesia
  | 'pendente'         // rejeitada, sem cobrança definida ainda
  | 'cobrada'          // cobrança lançada, aguardando pagamento
  | 'paga'             // cliente pagou
  | 'baixada_prejuizo';// cobrança não recebida — assumida como prejuízo

// Itens marcados pelo garantista no checklist da cobrança.
// Horas/KM ligam/desligam o pagamento de serviço; peças trazem a lista de
// `garantia_pecas.id` que entrarão na cobrança.
export interface CobrancaItens {
  horas?: boolean;
  km?: boolean;
  pecas?: string[]; // ids de garantia_pecas
  // Valores editados pelo garantista — sobrepõem o cálculo padrão (horas×hora,
  // km×km, preço da peça). Ausente = usa o cálculo padrão. Peças: chave = id.
  valores?: {
    horas?: number;
    km?: number;
    pecas?: Record<string, number>;
  };
}

// Linhas livres ("outros") — taxa de visita, deslocamento extra, etc.
export interface CobrancaOutro {
  descricao: string;
  valor: number;
}
export type PendenciaTipo = 'bo' | 'info_fabrica';
export type PendenciaStatus = 'aberta' | 'respondida';
export type PecaOrigem = 'ppv' | 'pecasinfo_manual';
export type PecaResultado = 'pendente' | 'aprovada' | 'rejeitada';
export type AnexoCategoria =
  | 'tecnico'
  | 'garantista'
  | 'pendencia_pedido'
  | 'pendencia_resposta'
  | 'retorno_fabrica'
  | 'envio_fabrica'
  | 'foto_garantista'
  | 'nf_venda'        // NF de venda do equipamento (fluxo e-mail)
  | 'relatorio_at';   // Relatório de Assistência Técnica (fluxo e-mail)

// --- Checklist configurável por montadora -----------------------------------
export type ChecklistFieldTipo =
  | 'secao'
  | 'texto'
  | 'numero'
  | 'data'
  | 'checkbox'
  | 'select'
  | 'file';

export interface ChecklistField {
  id: string;
  tipo: ChecklistFieldTipo;
  label: string;
  obrigatorio: boolean;
  opcoes?: string[]; // para tipo 'select'
  ajuda?: string;
}

// 'mahindra' = SG xlsx; 'email' = solicitação por e-mail (sem planilha,
// corpo modelado pelo Tratorilson + RAT + NF de venda + fotos)
export type TipoTemplate = 'sem_template' | 'mahindra' | 'email';

// Fluxo da garantia por montadora: 'padrao' = peças + serviço numa etapa;
// 'duas_etapas' = peças primeiro, ressarcimento de horas/km depois do serviço.
export type MontadoraFluxo = 'padrao' | 'duas_etapas';

export interface Montadora {
  id: string;
  nome: string;
  ativo: boolean;
  fluxo: MontadoraFluxo;
  ressarcimento_por_email: boolean;
  checklist_def: ChecklistField[];
  cor: string | null;
  logo_url: string | null;
  contato_fabrica: string | null;
  criado_por: string | null;
  email_destinatarios: string[];
  tipo_template: TipoTemplate;
  auto_enviar_email: boolean;
  email_assunto: string | null;
  email_corpo: string | null;
  email_assinatura: string | null;
  proximo_numero_sg: number;
  created_at: string;
  updated_at: string;
}

// --- Entidades --------------------------------------------------------------
export interface GarantiaPeca {
  id: string;
  garantia_id: string;
  cod_produto: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  origem: PecaOrigem | null;
  fonte_ppv_id: string | null;
  resultado: PecaResultado;
  created_at: string;
}

export interface GarantiaPendencia {
  id: string;
  garantia_id: string;
  tipo: PendenciaTipo;
  status: PendenciaStatus;
  status_retorno: string | null;
  descricao: string;
  exige_visita: boolean;
  criado_por: string;
  resposta_texto: string | null;
  respondido_por: string | null;
  respondido_em: string | null;
  created_at: string;
}

export interface GarantiaAnexo {
  id: string;
  garantia_id: string;
  pendencia_id: string | null;
  categoria: AnexoCategoria;
  url: string;
  nome_arquivo: string | null;
  content_type: string | null;
  enviado_por: string | null;
  created_at: string;
}

export interface GarantiaEvento {
  id: string;
  garantia_id: string;
  tipo: string;
  status_anterior: string | null;
  status_novo: string | null;
  ator: string | null;
  detalhe: string | null;
  created_at: string;
}

// Conversa com a fábrica (e-mails enviados/recebidos por garantia)
export interface GarantiaEmailAnexo {
  nome: string;
  url: string;
  content_type: string | null;
  size?: number;
}

export interface GarantiaEmail {
  id: string;
  garantia_id: string | null; // null = recebido não casado (triagem)
  direcao: 'enviado' | 'recebido';
  message_id: string | null;
  in_reply_to: string | null;
  references_ids: string[] | null;
  de: string | null;
  para: string[] | null;
  assunto: string | null;
  corpo_texto: string | null;
  corpo_html: string | null;
  data: string | null;
  anexos: GarantiaEmailAnexo[];
  uid: number | null;
  pasta: string | null;
  lida: boolean;
  casado_por: string | null;
  created_at: string;
}

export interface Garantia {
  id: string;
  numero: string;
  numero_externo: string | null;
  id_ordem: string;
  chassis: string | null;
  modelo: string | null;
  cliente: string | null;
  ppv_ids: string | null;
  montadora_id: string | null;
  status: GarantiaStatus;
  tecnico_nome: string;
  garantista_nome: string | null;
  garantista_user_id: string | null;
  tecnico_horas: number;
  tecnico_km: number;
  tecnico_obs: string | null;
  garantista_horas: number | null;
  garantista_km: number | null;
  garantista_obs: string | null;
  checklist_snapshot: ChecklistField[] | null;
  checklist_respostas: Record<string, unknown>;
  resultado: GarantiaResultado | null;
  motivo_recusa: string | null;
  recusado_por: 'garantista' | 'fabrica' | null;
  retorno_fabrica_url: string | null;
  valor_pago_horas: number | null;
  valor_pago_km: number | null;
  valor_pago_pecas: number | null;
  valor_pago_total: number | null;
  enviada_fabrica_em: string | null;
  pecas_retorno_em: string | null;
  ressarcimento_enviado_em: string | null;
  finalizada_em: string | null;
  // Cobrança ao cliente (rejeitadas)
  cobranca_status: CobrancaStatus;
  cobranca_itens: CobrancaItens;
  cobranca_valor_total: number | null;
  cobranca_outros: CobrancaOutro[];
  cobranca_vencimento: string | null;     // DATE (YYYY-MM-DD)
  cobranca_cobrada_em: string | null;
  cobranca_pago_em: string | null;
  cobranca_baixada_em: string | null;
  cobranca_obs: string | null;
  created_at: string;
  updated_at: string;
}

export interface GarantiaDetalhe extends Garantia {
  montadora: Montadora | null;
  pecas: GarantiaPeca[];
  pendencias: GarantiaPendencia[];
  anexos: GarantiaAnexo[];
  eventos: GarantiaEvento[];
  emails_nao_lidos?: number; // respostas da fábrica não lidas (conversa)
}

// Item da lista/Kanban (com embeds reduzidos)
export interface GarantiaResumo extends Garantia {
  montadora: { id: string; nome: string; cor: string | null } | null;
  pecas: { id: string }[];
  pendencias: {
    id: string;
    tipo: PendenciaTipo;
    status: PendenciaStatus;
    descricao: string;
    exige_visita: boolean;
  }[];
  anexos: {
    id: string;
    categoria: AnexoCategoria;
    url: string;
    nome_arquivo: string | null;
    created_at: string;
  }[];
}

// Peça da OS disponível para o técnico selecionar
export interface PecaOS {
  cod_produto: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  origem: PecaOrigem;
  fonte_ppv_id: string | null;
}

// OS elegível para abrir garantia
export interface OSElegivel {
  id_ordem: string;
  cliente: string;
  chassis: string | null;
  data: string;
  tipo_servico: string;
  serv_solicitado: string;
}

// Foto do relatório técnico da OS (para download na garantia)
export interface FotoOS {
  chave: string;
  label: string;
  url: string;
}

// --- Relatório --------------------------------------------------------------
export interface RelatorioMontadora {
  montadora_id: string | null;
  nome: string;
  cor: string | null;
  qtd_total: number;
  qtd_aprovadas: number;
  qtd_rejeitadas: number;
  qtd_rejeitadas_fabrica: number;
  qtd_rejeitadas_garantista: number;
  qtd_abertas: number;
  lucro: number;        // soma valor_pago_total das aprovadas
  prejuizo: number;     // soma do valor pleiteado das rejeitadas
  saldo: number;        // lucro - prejuizo
  total_tecnico_horas: number;
  total_tecnico_km: number;
  total_garantista_horas: number;
  total_garantista_km: number;
  tempo_medio_resolucao_dias: number | null; // finalizadas
  tempo_medio_aberto_dias: number | null;    // em aberto na fábrica (aging)
  // Cobrança ao cliente (rejeitadas) ─────────────────────────────────────
  recuperado_cliente: number; // soma das cobrancas com status 'paga'
  a_receber: number;          // soma das cobrancas 'cobrada' não vencidas
  vencido: number;            // soma das cobrancas 'cobrada' vencidas
  prejuizo_liquido: number;   // prejuizo - recuperado_cliente
  qtd_cobrancas_pagas: number;
  qtd_cobrancas_pendentes: number;
  qtd_cobrancas_vencidas: number;
}

export interface RelatorioGarantias {
  por_montadora: RelatorioMontadora[];
  totais: {
    lucro: number;
    prejuizo: number;
    saldo: number;
    qtd_finalizadas: number;
    // Cobrança ao cliente
    recuperado_cliente: number;
    a_receber: number;
    vencido: number;
    prejuizo_liquido: number;
  };
}
