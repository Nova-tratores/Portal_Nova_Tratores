// Tipos compartilhados do módulo Ajustes (front + back).

import type { Conta } from './conta';

/** Status de um job de background (tabela ajustes_jobs — arquitetura worker-ready). */
export type JobStatus = 'rodando' | 'concluido' | 'erro';

/** Tipos de job de background suportados. */
export type JobTipo =
  | 'estoque-negativo'
  | 'inventario-recalcular'
  | 'inventario-ciclo'
  | 'mahindra-gerar'
  | 'caracteristicas-sync'
  | 'verificacao-diaria'
  | 'remessas-devolver';

/** Linha da tabela ajustes_jobs. */
export interface AjustesJob {
  id: number;
  tipo: JobTipo;
  conta_omie: Conta | null;
  status: JobStatus;
  etapa: string | null;
  progresso: Record<string, unknown> | null;
  resultado: Record<string, unknown> | null;
  erro: string | null;
  iniciado_em: string;
  atualizado_em: string;
  criado_por: string | null;
}
