// Catálogo de permissões — fonte única pra organizar a tela de Admin e os checks.
//
// Modelo (compatível com o sistema atual, sem quebrar ninguém):
//  - módulo "puro" em modulos_permitidos (ex: 'requisicoes') = ACESSO TOTAL ao módulo.
//  - 'modulo:acao' (ex: 'requisicoes:mover_fase') = permissão GRANULAR de uma ação.
//  Quem já tem o módulo puro continua podendo tudo; para restringir, troca-se o
//  acesso total por ações específicas.

export interface AcaoPermissao {
  id: string;
  label: string;
}

// Ordem dos grupos na tela de Admin.
export const GRUPOS_ORDEM = ['Serviços', 'Peças', 'Financeiro', 'Comercial', 'Estoque', 'Ajustes', 'Outros'] as const;

// módulo id → grupo (organiza os módulos na tela). Ids que não estão aqui caem em 'Outros'.
const GRUPO_POR_MODULO: Record<string, string> = {
  // Serviços
  pos: 'Serviços', garantias: 'Serviços', revisoes: 'Serviços', mecanicos: 'Serviços',
  'painel-mecanicos': 'Serviços', sat: 'Serviços', mapa: 'Serviços', 'fotos-tecnicos': 'Serviços',
  // Peças
  ppv: 'Peças', orcamentos: 'Peças', requisicoes: 'Peças',
  // Financeiro
  financeiro: 'Financeiro', dre: 'Financeiro',
  // Comercial
  propostas: 'Comercial', feedbacks: 'Comercial', clientes: 'Comercial', 'supervisor-vendas': 'Comercial',
  // Estoque
  'visual-estoque': 'Estoque', estoque: 'Estoque',
  // Outros
  opa: 'Outros', avisos: 'Outros', tarefas: 'Outros', 'dashboard-agro': 'Outros', tratorilson: 'Outros',
};

export function grupoDoModulo(id: string): string {
  if (id.startsWith('ajustes')) return 'Ajustes';
  return GRUPO_POR_MODULO[id] || 'Outros';
}

// Ações granulares por módulo. Módulo sem entrada aqui = só liga/desliga (acesso total).
// (Fase 1: só Requisições. Os demais entram aqui conforme forem enforçados.)
export const ACOES_POR_MODULO: Record<string, AcaoPermissao[]> = {
  requisicoes: [
    { id: 'criar', label: 'Criar requisição' },
    { id: 'editar', label: 'Editar requisição' },
    { id: 'mover_fase', label: 'Mover de fase' },
    { id: 'criar_fornecedor', label: 'Criar/editar fornecedor' },
    { id: 'criar_veiculo', label: 'Criar/editar veículo' },
    { id: 'tags', label: 'Gerir etiquetas' },
    { id: 'excluir', label: 'Excluir / lixeira' },
    { id: 'imprimir', label: 'Imprimir' },
  ],
  orcamentos: [
    { id: 'criar', label: 'Criar orçamento' },
    { id: 'editar', label: 'Editar orçamento' },
    { id: 'status', label: 'Mudar status' },
    { id: 'gerar', label: 'Gerar OS / PPV' },
    { id: 'excluir', label: 'Excluir orçamento' },
  ],
  ppv: [
    { id: 'criar', label: 'Criar lançamento' },
    { id: 'editar', label: 'Editar pedido' },
    { id: 'mover_fase', label: 'Mover de fase' },
    { id: 'adicionar_item', label: 'Adicionar/editar itens' },
    { id: 'enviar_omie', label: 'Enviar ao Omie' },
    { id: 'cancelar', label: 'Cancelar pedido' },
    { id: 'catalogo', label: 'Gerir catálogo de produtos' },
  ],
  pos: [
    { id: 'criar', label: 'Criar OS' },
    { id: 'editar', label: 'Editar OS' },
    { id: 'mover_fase', label: 'Mover de fase' },
    { id: 'enviar_omie', label: 'Enviar ao Omie' },
    { id: 'concluir', label: 'Concluir OS' },
    { id: 'cancelar', label: 'Cancelar OS' },
  ],
  garantias: [
    { id: 'criar', label: 'Criar garantia (manual)' },
    { id: 'analisar', label: 'Analisar / editar' },
    { id: 'enviar_fabrica', label: 'Enviar à fábrica' },
    { id: 'finalizar', label: 'Finalizar (aprovar/recusar)' },
    { id: 'montadoras', label: 'Configurar montadoras' },
  ],
  tarefas: [
    { id: 'criar', label: 'Criar/atribuir tarefa' },
    { id: 'concluir', label: 'Concluir/reabrir tarefa' },
  ],
  'supervisor-vendas': [
    { id: 'resolver_pos_vendas', label: 'Resolver pós-venda' },
    { id: 'gerenciar_carros', label: 'Vincular/remover carros' },
  ],
  clientes: [
    { id: 'criar_cliente', label: 'Criar cliente' },
    { id: 'criar_projeto', label: 'Criar projeto' },
    { id: 'anexos', label: 'Anexar OS/PV/NF' },
    { id: 'etiquetas', label: 'Gerir etiquetas' },
  ],
};

export function acoesDoModulo(id: string): AcaoPermissao[] {
  return ACOES_POR_MODULO[id] || [];
}

// =====================================================================
// Helpers puros pra editar o array modulos_permitidos na UI do Admin.
// =====================================================================

export type EstadoModulo = 'total' | 'parcial' | 'off';

// Estado de um módulo no array: total (módulo puro), parcial (só ações), off.
export function estadoModulo(perms: string[], mod: string): EstadoModulo {
  if (perms.includes(mod)) return 'total';
  if (perms.some((p) => p.startsWith(mod + ':'))) return 'parcial';
  return 'off';
}

// Ações marcadas de um módulo (ids sem o prefixo).
export function acoesMarcadas(perms: string[], mod: string): Set<string> {
  const pref = mod + ':';
  return new Set(perms.filter((p) => p.startsWith(pref)).map((p) => p.slice(pref.length)));
}

// remove o módulo puro e todas as ações dele
function limpar(perms: string[], mod: string): string[] {
  return perms.filter((p) => p !== mod && !p.startsWith(mod + ':'));
}

// Acesso total: módulo puro, sem ações específicas.
export function setTotal(perms: string[], mod: string): string[] {
  return [...limpar(perms, mod), mod];
}

// Sem acesso ao módulo.
export function setOff(perms: string[], mod: string): string[] {
  return limpar(perms, mod);
}

// Liga/desliga uma ação específica. Ao usar granular, sai do "acesso total"
// (remove o módulo puro). Se ficar sem nenhuma ação, o módulo fica off.
export function toggleAcao(perms: string[], mod: string, acao: string): string[] {
  const key = `${mod}:${acao}`;
  let arr = perms.filter((p) => p !== mod); // sai do acesso total
  arr = arr.includes(key) ? arr.filter((p) => p !== key) : [...arr, key];
  return arr;
}
