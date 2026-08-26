// Fases padrão geradas ao "Gerar tarefas da OS" (encadeadas FS).
// Ajuste aqui se a operação usar outra sequência.
export interface FaseOS { nome: string; duracao: number }

export const FASES_OS: FaseOS[] = [
  { nome: 'Diagnóstico', duracao: 1 },
  { nome: 'Pedido de peças', duracao: 3 },
  { nome: 'Execução', duracao: 2 },
  { nome: 'Teste', duracao: 1 },
  { nome: 'Entrega / Faturamento', duracao: 1 },
];
