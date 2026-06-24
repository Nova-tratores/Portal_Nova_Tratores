// ════════════════════════════════════════════════════════════════════
// Motor de agendamento — contrato de entrada/saída
// TS puro: roda no browser (preview otimista) e no servidor (autoritativo).
// NÃO importe React/Supabase/Node aqui.
// Datas são strings ISO 'YYYY-MM-DD' (sem hora/fuso — dias úteis).
// ════════════════════════════════════════════════════════════════════

export type TipoDep = 'FS' | 'SS' | 'FF' | 'SF';

export type TipoRestricao =
  | 'asap'
  | 'iniciar_nao_antes'
  | 'iniciar_nao_depois'
  | 'data_fixa';

export type StatusTarefa =
  | 'pendente'
  | 'bloqueada'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada';

export type TipoTarefa = 'tarefa' | 'marco' | 'resumo';

export interface Calendario {
  id: string;
  diasSemana: number[]; // ISO 1=seg ... 7=dom. "Só quartas" = [3]
  excecoes: { data: string; tipo: 'folga' | 'extra' }[];
}

export interface Recurso {
  id: string;
  calendarioId: string;
}

export interface TarefaIn {
  id: string;
  duracaoDias: number;
  restricao: TipoRestricao;
  restricaoData?: string; // ISO date
  recursoId?: string;
  parentId?: string | null;
  tipo?: TipoTarefa; // default 'tarefa'
  inicioReal?: string; // se já começou, ancora aqui
  fimReal?: string; // se concluída, ancora aqui
  status: StatusTarefa;
}

export interface DepIn {
  predecessoraId: string;
  sucessoraId: string;
  tipo: TipoDep;
  lagDias: number;
}

export interface EntradaMotor {
  inicioProjeto: string; // ISO date
  calendarioPadraoId: string;
  tarefas: TarefaIn[];
  dependencias: DepIn[];
  recursos: Recurso[];
  calendarios: Calendario[];
}

export interface TarefaOut {
  id: string;
  inicioCalc: string;
  fimCalc: string;
  folgaDias: number;
  eCritica: boolean;
}

export type TipoErro = 'ciclo' | 'restricao_violada';

export interface ErroMotor {
  tipo: TipoErro;
  detalhe: string;
  ids: string[];
}

export interface SaidaMotor {
  tarefas: TarefaOut[];
  fimProjeto: string;
  erros: ErroMotor[];
}
