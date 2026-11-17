// Visão da empresa (/empresa) como módulo do Admin (José, 17/11/2026: "dá a opção para Dev de dar acesso ao módulo
// Visão da empresa, por setor e módulo dentro de cada setor, porque vou precisar deixar mais de uma pessoa para
// confirmar requisições"). Diretor, Admin e Dev veem tudo, como antes. Quem tem o módulo "empresa":
//   - módulo inteiro → todos os setores (menos as ações explícitas)
//   - "empresa:<setor>" → só aquele setor
//   - "empresa:autorizar-requisicoes" (EXPLÍCITA) → decide as requisições de R$ 200 ou mais, junto com o Diretor
export const MODULO_EMPRESA = 'empresa';

export const SETORES_EMPRESA = [
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'comercial', label: 'Comercial' },
  { id: 'posvendas', label: 'Pós-Vendas' },
  { id: 'pecas', label: 'Peças' },
  { id: 'frota', label: 'Frota' },
  { id: 'requisicoes', label: 'Requisições' },
  { id: 'autorizacoes', label: 'Autorizações (ver a fila)' },
] as const;

export const ACAO_AUTORIZAR_REQUISICOES = 'autorizar-requisicoes';
