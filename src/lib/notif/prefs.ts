// Preferências de notificação por usuário.
//
// Cada usuário pode silenciar módulos individualmente (notif_silenciado).
// Mas alguns módulos são OBRIGATÓRIOS pra certas categorias — quem é
// "Pós Vendas" não pode tirar notificação de garantia, e por aí vai.
//
// Esse arquivo é importável de client e server.

// Módulos que TODA categoria recebe obrigatoriamente.
// Avisos são comunicados internos — ninguém pode silenciar.
export const NOTIF_OBRIGATORIAS_GLOBAIS: string[] = ['avisos'];

// Cargo → módulos que aquele cargo SEMPRE recebe.
export const NOTIF_OBRIGATORIAS_POR_CATEGORIA: Record<string, string[]> = {
  'Pós Vendas': ['pos', 'garantias', 'orcamentos'],
  'Peças':      ['ppv', 'requisicoes', 'orcamentos'],
  'Comercial':  ['propostas'],
  'Financeiro': ['financeiro'],
};

// Lista todos os módulos que aparecem nas preferências do usuário.
// Ordem é a que vai aparecer na UI.
export const MODULOS_NOTIFICAVEIS: { id: string; nome: string }[] = [
  { id: 'avisos',      nome: 'Avisos do Portal' },
  { id: 'financeiro',  nome: 'Financeiro' },
  { id: 'lembrete_nf', nome: 'Lembrete: NF de serviço pendente (Pasta Clientes)' },
  { id: 'pos',         nome: 'Pós-Vendas (OS)' },
  { id: 'garantias',   nome: 'Garantias' },
  { id: 'ppv',         nome: 'Peças (PPV)' },
  { id: 'requisicoes', nome: 'Requisições' },
  { id: 'orcamentos',  nome: 'Orçamentos' },
  { id: 'propostas',   nome: 'Propostas Comerciais' },
  { id: 'revisoes',    nome: 'Controle de Revisões' },
  { id: 'feedbacks',   nome: 'Feedbacks & CRM' },
  { id: 'tarefas',     nome: 'Tarefas' },
  { id: 'tickets',     nome: 'Tickets' },
  { id: 'atividades',  nome: 'Atividades' },
];

// Resolve módulos obrigatórios pra uma categoria — combina globais + da
// categoria. Sem duplicatas.
export function modulosObrigatorios(categoria: string | null | undefined): string[] {
  const cat = String(categoria || '').trim();
  const especificos = NOTIF_OBRIGATORIAS_POR_CATEGORIA[cat] || [];
  return Array.from(new Set([...NOTIF_OBRIGATORIAS_GLOBAIS, ...especificos]));
}

// Tira módulos obrigatórios da lista de silenciados (o usuário tentou
// silenciar mas não pode). É a função que o endpoint chama antes de salvar.
export function sanitizarSilenciados(
  silenciados: string[],
  categoria: string | null | undefined,
): string[] {
  const obrigatorios = new Set(modulosObrigatorios(categoria));
  return Array.from(new Set(silenciados.filter((m) => !obrigatorios.has(m))));
}

// Decide se um usuário deve receber notificação de um módulo, dado o estado
// das preferências dele. Obrigatórios sempre passam.
export function podeNotificar(
  modulo: string,
  silenciados: string[] | null | undefined,
  categoria: string | null | undefined,
): boolean {
  const obrigatorios = new Set(modulosObrigatorios(categoria));
  if (obrigatorios.has(modulo)) return true;
  return !(silenciados || []).includes(modulo);
}

// Linha de portal_permissoes com o necessário pra decidir o envio.
export interface PrefsDestinatario {
  user_id: string;
  categoria?: string | null;
  notif_silenciado?: string[] | null;
}

// Helper central: dado um módulo e as linhas de portal_permissoes dos candidatos
// (com user_id, categoria, notif_silenciado), devolve os user_id que devem
// receber a notificação — respeitando o silenciamento. Sem duplicatas.
// IMPORTANTE: `modulo` é o ID do módulo silenciável (ex: 'requisicoes',
// 'revisoes', 'garantias'), que pode diferir do `tipo` salvo na notificação
// (ex: 'requisicao', 'revisao', 'garantia').
export function filtrarDestinatarios(
  modulo: string,
  pessoas: PrefsDestinatario[] | null | undefined,
): string[] {
  return Array.from(
    new Set(
      (pessoas || [])
        .filter((p) => p.user_id && podeNotificar(modulo, p.notif_silenciado, p.categoria))
        .map((p) => p.user_id),
    ),
  );
}
