// Catálogo de permissões — fonte única pra organizar a tela de Admin e os checks.
//
// Modelo (compatível com o sistema atual, sem quebrar ninguém):
//  - módulo "puro" em modulos_permitidos (ex: 'requisicoes') = ACESSO TOTAL ao módulo.
//  - 'modulo:acao' (ex: 'requisicoes:mover_fase') = permissão GRANULAR de uma ação.
//  Quem já tem o módulo puro continua podendo tudo; para restringir, troca-se o
//  acesso total por ações específicas.

import { PAGINAS_AJUSTES } from '@/app/(portal)/ajustes/paginas';
import { PAGINAS_FROTA } from '@/app/(portal)/frota/paginas';

export interface AcaoPermissao {
  id: string;
  label: string;
}

// Ordem dos grupos na tela de Admin.
export const GRUPOS_ORDEM = ['Serviços', 'Peças', 'Financeiro', 'Comercial', 'Estoque', 'Frota', 'Ajustes', 'Outros'] as const;

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
  'consulta-estoque': 'Estoque', estoque: 'Estoque',
  frota: 'Frota',
  // Outros
  opa: 'Outros', avisos: 'Outros', tarefas: 'Outros', 'dashboard-agro': 'Outros', tratorilson: 'Outros',
  tickets: 'Outros',
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
    // 'criar_veiculo' morreu na Fase 5 do Frota: veículo agora se cadastra SÓ
    // no módulo Frota (frota:veiculos:editar). A chave antiga gravada em quem
    // a tinha é inofensiva (a aba não existe mais).
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
  revisoes: [
    { id: 'tratores', label: 'Criar/editar trator' },
    { id: 'enviar', label: 'Enviar revisão/inspeção' },
    { id: 'observacoes', label: 'Observações (criar/resolver/excluir)' },
    { id: 'lembretes', label: 'Lembretes' },
    { id: 'destinatarios', label: 'Gerir destinatários' },
  ],
  propostas: [
    { id: 'criar', label: 'Cadastrar (cliente/trator/implemento/proposta)' },
    { id: 'editar', label: 'Editar cadastros' },
    { id: 'excluir', label: 'Lixeira' },
    { id: 'sincronizar', label: 'Sincronizar Omie' },
  ],
  avisos: [
    { id: 'criar', label: 'Criar aviso' },
    { id: 'editar_status', label: 'Ativar/desativar' },
    { id: 'excluir', label: 'Excluir aviso' },
  ],
  mecanicos: [
    { id: 'criar_ocorrencia', label: 'Criar ocorrência' },
    { id: 'justificar_alerta', label: 'Justificar alerta' },
    { id: 'converter_alerta', label: 'Converter alerta em ocorrência' },
    { id: 'atualizar_ocorrencia', label: 'Atualizar status da ocorrência' },
  ],
  'painel-mecanicos': [
    { id: 'criar_ocorrencia', label: 'Registrar ocorrência' },
    { id: 'aprovar_requisicao', label: 'Aprovar requisição' },
    { id: 'recusar_requisicao', label: 'Recusar requisição' },
    { id: 'converter_alerta', label: 'Converter alerta em ocorrência' },
    { id: 'avaliar_justificativa', label: 'Avaliar justificativa' },
  ],
  // Financeiro: só as ações de CRIAÇÃO são granulares. O gerenciamento do
  // kanban segue restrito a admin (isAdmin), por decisão do usuário.
  financeiro: [
    { id: 'criar_lancamento', label: 'Criar conta a pagar/receber' },
    { id: 'criar_chamado', label: 'Abrir chamado (NF/RH)' },
  ],
  // DRE Financeiro: granular POR TELA (cada ação = uma tela analítica). O id da
  // ação é o slug da rota (/dre-financeiro/<id>). Quem tem 'financeiro' ou é
  // admin vê todas; senão, vê só as telas liberadas. 'dre' puro = todas.
  dre: [
    { id: 'calendario', label: 'Calendário' },
    { id: 'vencidos', label: 'Vencidos' },
    { id: 'curva-saldo', label: 'Curva de Saldo' },
    { id: 'fluxo', label: 'Fluxo' },
    { id: 'movimentos', label: 'Movimentações CC' },
    { id: 'ciclo-caixa', label: 'Ciclo de Caixa' },
    { id: 'aderencia', label: 'Pontualidade' },
    { id: 'dre', label: 'DRE' },
    { id: 'analise-dre', label: 'Análise DRE' },
    { id: 'composicao', label: 'Composição' },
    { id: 'patrimonio', label: 'Patrimônio' },
    { id: 'rentabilidade', label: 'Rentabilidade' },
    { id: 'lucratividade', label: 'Lucratividade' },
    { id: 'margens', label: 'Margens' },
    { id: 'vendas-modelo', label: 'Vendas/Modelo' },
    { id: 'clientes', label: 'Clientes' },
    { id: 'monitor', label: 'Monitor' },
  ],
  // Visual Estoque (Consulta Omie): granular POR TELA. A chave do módulo é
  // 'consulta-estoque' (o que as páginas e o menu lateral realmente checam).
  // A Home (/visual-estoque) é o landing e fica liberada pra quem tem o módulo.
  'consulta-estoque': [
    { id: 'showroom', label: 'Showroom' },
    { id: 'patio', label: 'Pátio' },
    // 'frota' foi absorvida pelo módulo Frota (compat removida em 16/07 —
    // ninguém mais tinha a chave legada consulta-estoque:frota)
    { id: 'remessas', label: 'Remessas' },
    { id: 'notas-entrada', label: 'Notas de Entrada' },
    { id: 'margens', label: 'Margens' },
    { id: 'alertas', label: 'Alertas' },
  ],
  // Ajustes: módulo único que expande nas suas páginas (derivadas de
  // PAGINAS_AJUSTES — fonte única). id da ação = chave sem o prefixo 'ajustes:'.
  // 'pedidos:encerrar' é uma AÇÃO dentro da página Pedidos (encerrar informal).
  ajustes: [
    ...PAGINAS_AJUSTES.map((p) => ({ id: p.key.replace('ajustes:', ''), label: p.label })),
    { id: 'pedidos:encerrar', label: 'Pedidos — Encerrar informal' },
    { id: 'remessas:fechar', label: 'Remessas — Devolver/fechar em massa' },
  ],
  // Feedbacks & CRM: granular POR TELA (id da ação = slug da rota). A Home
  // (/feedbacks) é o landing; as abas (FeedbackTabs) e o acesso por URL seguem
  // pode('feedbacks', slug).
  feedbacks: [
    { id: 'crm', label: 'CRM' },
    { id: 'rfm', label: 'RFM' },
    { id: 'clientes', label: 'Histórico de atendimentos' },
    { id: 'relatorios', label: 'Relatórios' },
    { id: 'agenda', label: 'Agenda' },
    { id: 'oportunidades', label: 'Oportunidades' },
  ],
  // FROTA — granular POR TELA. As telas vêm de PAGINAS_FROTA (fonte única:
  // adicionar tela lá já cria a permissão aqui). Abaixo delas, as ações que
  // NÃO são telas.
  frota: [
    ...PAGINAS_FROTA.map((p) => ({ id: p.key.replace('frota:', ''), label: p.label })),
    { id: 'veiculos:editar', label: 'Veículos — editar a ficha' },
    { id: 'veiculos:responsavel', label: 'Veículos — trocar o responsável' },
    { id: 'multas:editar', label: 'Multas — mudar status / desconto' },
    { id: 'paradas:justificar', label: 'Paradas — justificar / ignorar atípicas' },
    // 'patio:editar' morreu com a tela de pátio (13/07) — as APIs que restaram
    // (valor FIPE, imagem do veículo) passaram a exigir veiculos:editar.
    { id: 'documentos:editar', label: 'Documentos — enviar / excluir' },
    { id: 'abastecimento:upload', label: 'Abastecimento — importar CSV / gerir lotes' },
  ],
  // Estoque (Visual Estoque / Consulta Omie): granular POR TELA. Chave 'estoque'
  // (id da rota = slug). A Home (/estoque, busca de produto) é o landing.
  estoque: [
    { id: 'dashboard', label: 'Dashboard de Vendas' },
    { id: 'notas-entrada', label: 'Notas de Entrada' },
    { id: 'cadastro-produto', label: 'Cadastro de Produto' },
    { id: 'curva-abc', label: 'Curva ABC' },
    { id: 'giro-estoque', label: 'Giro de Estoque' },
    { id: 'comissao', label: 'Comissão' },
    { id: 'recebimentos', label: 'Recebimentos' },
    { id: 'admin', label: 'Admin' },
    { id: 'admin-cmc', label: 'Admin CMC' },
    { id: 'ignorar-clientes', label: 'Ignorar Clientes' },
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
