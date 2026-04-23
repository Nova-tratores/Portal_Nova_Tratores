export type TipoObservacao =
  | 'geral'
  | 'em_banco'
  | 'certificado_pendente'
  | 'pendencia_cliente'
  | 'outro';

export type StatusObservacao = 'ativa' | 'resolvida';

export interface Observacao {
  id: number;
  trator_id: string;
  chassis: string;
  tipo: TipoObservacao;
  texto: string;
  status: StatusObservacao;
  criado_por_nome: string | null;
  criado_por_email: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  created_at: string;
  updated_at: string;
}

export const TIPOS_LABEL: Record<TipoObservacao, string> = {
  geral: 'Geral',
  em_banco: 'Em banco',
  certificado_pendente: 'Certificado pendente',
  pendencia_cliente: 'Pendência cliente',
  outro: 'Outro',
};

export const TIPOS_LISTA: TipoObservacao[] = [
  'geral',
  'em_banco',
  'certificado_pendente',
  'pendencia_cliente',
  'outro',
];
