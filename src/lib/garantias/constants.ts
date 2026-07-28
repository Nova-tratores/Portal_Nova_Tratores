// Constantes do módulo de Garantias
import type { GarantiaStatus, ChecklistFieldTipo } from './types';

// Tabelas
export const TBL_GARANTIAS   = 'garantias';
export const TBL_GAR_PECAS   = 'garantia_pecas';
export const TBL_GAR_PEND    = 'garantia_pendencias';
export const TBL_GAR_ANEXOS  = 'garantia_anexos';
export const TBL_GAR_EVENTOS = 'garantia_eventos';
export const TBL_GAR_EMAILS  = 'garantia_emails';
export const TBL_MONTADORAS  = 'garantia_montadoras';
export const BUCKET_GARANTIAS = 'garantias';

// Valores (mesmos usados em lib/pos/constants.ts)
export const VALOR_HORA = 193.0;
export const VALOR_KM   = 2.8;

// Lista ordenada de status (ordem do pipeline).
// aguardando_servico / ressarcimento_fabrica só ocorrem em montadoras com
// fluxo 'duas_etapas' (peças primeiro, ressarcimento de horas/km depois).
export const STATUS_ORDEM: GarantiaStatus[] = [
  'aberta',
  'em_analise',
  'bo_tecnico',
  'enviada',
  'info_pendente',
  'aguardando_servico',
  'ressarcimento_fabrica',
  'aprovada',
  'rejeitada',
];

export const STATUS_LABEL: Record<GarantiaStatus, string> = {
  aberta:                'Solicitada',
  em_analise:            'Em análise',
  bo_tecnico:            'B.O. com o técnico',
  enviada:               'Em análise da fábrica',
  info_pendente:         'Informação pendente',
  aguardando_servico:    'Aguardando serviço',
  ressarcimento_fabrica: 'Ressarcimento na fábrica',
  aprovada:              'Aprovada',
  rejeitada:             'Rejeitada',
};

// Cores por status (badges / colunas do Kanban)
export const STATUS_COR: Record<GarantiaStatus, string> = {
  aberta:                '#0ea5e9',
  em_analise:            '#6366f1',
  bo_tecnico:            '#f59e0b',
  enviada:               '#8b5cf6',
  info_pendente:         '#f97316',
  aguardando_servico:    '#0d9488',
  ressarcimento_fabrica: '#c026d3',
  aprovada:              '#16a34a',
  rejeitada:             '#dc2626',
};

// Etiqueta exibida na OS (Pós-Vendas)
export const OS_BADGE_LABEL: Record<GarantiaStatus, string> = {
  aberta:                'Garantia em preparação',
  em_analise:            'Garantia em preparação',
  bo_tecnico:            'Garantia em preparação',
  enviada:               'Em análise da fábrica',
  info_pendente:         'Em análise da fábrica',
  aguardando_servico:    'Peças aprovadas — aguardando serviço',
  ressarcimento_fabrica: 'Ressarcimento na fábrica',
  aprovada:              'Garantia paga',
  rejeitada:             'Garantia não paga',
};

// Status terminais
export const STATUS_FINALIZADOS: GarantiaStatus[] = ['aprovada', 'rejeitada'];

// Transições legais (documentação do fluxo — as rotas validam status na mão).
// aguardando_servico/ressarcimento_fabrica: só montadoras com fluxo duas_etapas.
export const TRANSICOES: Record<GarantiaStatus, GarantiaStatus[]> = {
  aberta:                ['em_analise'],
  em_analise:            ['bo_tecnico', 'enviada'],
  bo_tecnico:            ['em_analise'],
  enviada:               ['info_pendente', 'aguardando_servico', 'aprovada', 'rejeitada'],
  info_pendente:         ['enviada', 'ressarcimento_fabrica'],
  aguardando_servico:    ['ressarcimento_fabrica'],
  ressarcimento_fabrica: ['info_pendente', 'aprovada', 'rejeitada'],
  aprovada:              [],
  rejeitada:             [],
};

// Tipos de campo do checklist configurável
export const CHECKLIST_TIPOS: { tipo: ChecklistFieldTipo; label: string }[] = [
  { tipo: 'secao',    label: 'Seção / Título' },
  { tipo: 'texto',    label: 'Texto' },
  { tipo: 'numero',   label: 'Número' },
  { tipo: 'data',     label: 'Data' },
  { tipo: 'checkbox', label: 'Sim / Não' },
  { tipo: 'select',   label: 'Lista de opções' },
  { tipo: 'file',     label: 'Arquivo / Imagem' },
];

// Fotos do relatório técnico da OS (chave na tabela Ordem_Servico_Tecnicos)
export const FOTOS_OS: { chave: string; label: string }[] = [
  { chave: 'FotoHorimetro',     label: 'Horímetro' },
  { chave: 'FotoChassis',       label: 'Chassi' },
  { chave: 'FotoFrente',        label: 'Frente' },
  { chave: 'FotoDireita',       label: 'Lado direito' },
  { chave: 'FotoEsquerda',      label: 'Lado esquerdo' },
  { chave: 'FotoTraseira',      label: 'Traseira' },
  { chave: 'FotoVolante',       label: 'Volante' },
  { chave: 'FotoFalha1',        label: 'Falha 1' },
  { chave: 'FotoFalha2',        label: 'Falha 2' },
  { chave: 'FotoFalha3',        label: 'Falha 3' },
  { chave: 'FotoFalha4',        label: 'Falha 4' },
  { chave: 'FotoPecaNova1',     label: 'Peça nova 1' },
  { chave: 'FotoPecaNova2',     label: 'Peça nova 2' },
  { chave: 'FotoPecaInstalada1', label: 'Peça instalada 1' },
  { chave: 'FotoPecaInstalada2', label: 'Peça instalada 2' },
  { chave: 'AssTecnico',        label: 'Assinatura do técnico' },
  { chave: 'AssCliente',        label: 'Assinatura do cliente' },
];
