// Busca do dashboard — índice das TELAS do portal (não só dos módulos).
// Quem procura "etiquetas" quer a tela de Etiquetas, não o card do PPV.
// Módulos com lista própria de páginas (Estoque, Ajustes, Frota, Marketing)
// entram daqui direto; o resto foi copiado das barras de cada módulo.
// Tela nova num módulo sem lista própria = linha nova aqui.
import { PAGINAS_ESTOQUE } from '@/app/(portal)/estoque/paginas'
import { PAGINAS_AJUSTES } from '@/app/(portal)/ajustes/paginas'
import { PAGINAS_FROTA } from '@/app/(portal)/frota/paginas'
import { PAGINAS_MARKETING } from '@/app/(portal)/marketing/paginas'

export interface Tela {
  nome: string
  href: string
  /** Nome do módulo, mostrado ao lado ("Peças › Etiquetas"). */
  area: string
  /** id do card do dashboard (cor e ícone). */
  sistema?: string
  /** Permissão: módulo e, se houver, a ação/sub-tela (pode(modulo, acao)). Sem módulo = todos. */
  modulo?: string
  acao?: string
  /** Outras palavras que levam a esta tela. */
  sinonimos?: string[]
}

// [nome, href, sinônimos?, ação?] — a ação é a sub-permissão (pode(modulo, acao)).
const t = (area: string, sistema: string | undefined, modulo: string | undefined, linhas: [string, string, string[]?, string?][]): Tela[] =>
  linhas.map(([nome, href, sinonimos, acao]) => ({ nome, href, area, sistema, modulo, sinonimos, acao }))

export const TELAS: Tela[] = [
  // ── Serviços
  ...t('Serviços', 'pos', 'pos', [['Pós-Vendas (OS)', '/pos', ['ordem de serviço', 'os', 'ordens']]]),
  ...t('Serviços', 'lousa', 'lousa', [['Lousa Virtual', '/lousa', ['agenda semanal']]]),
  ...t('Serviços', 'garantias', 'garantias', [
    ['Garantias', '/garantias'],
    ['Página do cliente (QR da garantia)', '/garantias?aba=cliente', ['qr code', 'adesivo']],
  ]),
  ...t('Serviços', 'controle-revisao', 'revisoes', [
    ['Controle de Revisões', '/revisoes', ['cheque de revisão', 'envio revisão']],
    ['Revisões Mahindra', '/revisoes/mahindra'],
  ]),
  ...t('Serviços', 'mecanicos', 'mecanicos', [['Janela Mecânicos', '/mecanicos', ['técnicos', 'gps']]]),
  ...t('Serviços', 'sat', 'sat', [['SAT Digital', '/sat']]),
  ...t('Serviços', 'mapa-geral', 'mapa', [['Mapeamento Técnico', '/mapa-geral', ['mapa']]]),
  ...t('Serviços', 'fotos-tecnicos', 'fotos-tecnicos', [['Fotos Técnicos', '/fotos-tecnicos']]),
  // ── Peças
  ...t('Peças', 'ppv', 'ppv', [
    ['Pré-Pedido de Venda', '/ppv', ['ppv', 'pedido de venda']],
    ['Catálogo de peças', '/ppv/catalogo', ['catálogo', 'vista explodida']],
    ['Etiquetas', '/ppv?tab=etiquetas', ['etiqueta', 'imprimir etiqueta'], 'etiquetas'],
    ['Retiradas', '/ppv/unidades', ['unidades', 'retirada']],
    ['Dashboard do PPV', '/ppv?tab=dashboard'],
  ]),
  ...t('Peças', 'orcamentos', 'orcamentos', [['Orçamentos', '/orcamentos', ['orçamento']]]),
  ...t('Peças', 'app-requisicoes', 'requisicoes', [['Requisições', '/requisicoes', ['requisição', 'mapa de cotações', 'cotação']]]),
  // ── Financeiro
  ...t('Financeiro', 'sistema-financeiro', 'financeiro', [
    ['Painel do Financeiro', '/financeiro/home-financeiro'],
    ['Kanban do Financeiro', '/financeiro/kanban-financeiro'],
    ['Painel Pós-Vendas (financeiro)', '/financeiro/home-posvendas'],
    ['Kanban Pós-Vendas (financeiro)', '/financeiro/kanban'],
    ['Painel Peças (financeiro)', '/financeiro/home-pecas'],
    ['Kanban Peças (financeiro)', '/financeiro/kanban-pecas'],
    ['Despesas', '/financeiro/historico-pagar', ['contas a pagar', 'histórico pagar']],
    ['Rastreio', '/financeiro/rastreio'],
    ['Vencidos (financeiro)', '/financeiro/vencidos', ['boletos vencidos', 'inadimplência']],
    ['Relatório de contas a pagar', '/financeiro/relatorio-pagar'],
    ['Novo chamado de NF', '/financeiro/novo-chamado-nf', ['nota fiscal']],
    ['Novo chamado de RH', '/financeiro/novo-chamado-rh'],
    ['Novo pagar/receber', '/financeiro/novo-pagar-receber'],
  ]),
  ...t('DRE Financeiro', 'dre', 'dre', [
    ['DRE', '/dre-financeiro/dre', ['demonstrativo de resultado']],
    ['Calendário financeiro', '/dre-financeiro/calendario'],
    ['Vencidos (DRE)', '/dre-financeiro/vencidos'],
    ['Curva de Saldo', '/dre-financeiro/curva-saldo'],
    ['Fluxo de caixa', '/dre-financeiro/fluxo', ['fluxo']],
    ['Ciclo de Caixa', '/dre-financeiro/ciclo-caixa'],
    ['Pontualidade', '/dre-financeiro/aderencia', ['aderência']],
    ['Análise DRE', '/dre-financeiro/analise-dre'],
    ['Composição', '/dre-financeiro/composicao'],
    ['Patrimônio', '/dre-financeiro/patrimonio'],
    ['Rentabilidade', '/dre-financeiro/rentabilidade'],
    ['Lucratividade', '/dre-financeiro/lucratividade'],
    ['Margens', '/dre-financeiro/margens'],
    ['Clientes (DRE)', '/dre-financeiro/clientes'],
    ['Monitor financeiro', '/dre-financeiro/monitor'],
  ]),
  // ── Comercial
  ...t('Comercial', 'proposta-comercial', 'propostas', [['Proposta Comercial', '/propostas', ['proposta']]]),
  ...t('Feedbacks & CRM', 'feedbacks', 'feedbacks', [
    ['Atendimento (fila de ligações)', '/feedbacks/atendimento', ['ligar', 'cockpit', 'ligação']],
    ['Oportunidades', '/feedbacks/oportunidades'],
    ['Agenda de retornos', '/feedbacks/agenda'],
    ['Clientes (feedbacks)', '/feedbacks/clientes'],
    ['CRM (feedbacks)', '/feedbacks/crm'],
    ['RFM', '/feedbacks/rfm'],
    ['Relatórios de atendimento', '/feedbacks/relatorios', ['performance dos atendentes']],
  ]),
  ...t('Comercial', 'clientes', 'clientes', [['Pastas Clientes', '/clientes', ['cliente', 'pasta']]]),
  ...t('Comercial', 'supervisor-vendas', 'supervisor-vendas', [['Supervisor Vendas', '/supervisor-vendas', ['visitas']]]),
  ...t('Gestão de Vendas', 'gestao-vendas', 'gestao-vendas', [
    ['Dashboard de Gestão de Vendas', '/gestao-vendas'],
    ['Vendas do Mês', '/gestao-vendas/vendas'],
    ['Ajustes por Venda', '/gestao-vendas/ajustes-venda', ['carimbo']],
    ['Custos Mensais', '/gestao-vendas/custos'],
    ['Relatórios de vendas', '/gestao-vendas/relatorios'],
  ]),
  ...t('Comercial', 'vendas-modelo', 'vendas-modelo', [['Vendas por Modelo', '/vendas-modelo']]),
  ...t('Comercial', 'lead', 'lead', [['Captura de Leads', '/lead', ['lead']]]),
  ...PAGINAS_MARKETING.map((p) => ({ nome: p.label === 'Ações' ? 'Ações de marketing' : p.label, href: p.href, area: 'Marketing', sistema: 'marketing', modulo: 'marketing' })),
  // ── Estoque
  ...t('Visual Estoque', 'consulta-estoque', 'consulta-estoque', [
    ['Visual Estoque', '/visual-estoque'],
    ['Showroom', '/visual-estoque/showroom'],
    ['Pátio', '/visual-estoque/patio'],
    ['Remessas (Visual Estoque)', '/visual-estoque/remessas'],
    ['Notas de Entrada (Visual Estoque)', '/visual-estoque/notas-entrada'],
    ['Margens (Visual Estoque)', '/visual-estoque/margens'],
    ['Alertas (Visual Estoque)', '/visual-estoque/alertas'],
  ]),
  { nome: 'Consulta de produto', href: '/estoque', area: 'Estoque', sistema: 'consulta-omie', modulo: 'estoque', sinonimos: ['consulta estoque', 'produto', 'saldo'] },
  ...PAGINAS_ESTOQUE.map((p) => ({ nome: p.label, href: p.href, area: 'Estoque', sistema: 'consulta-omie', modulo: 'estoque', acao: p.key })),
  ...PAGINAS_AJUSTES.map((p) => ({ nome: p.label, href: p.href, area: 'Ajustes', modulo: 'ajustes', acao: p.key.split(':')[1] })),
  // ── Frota
  ...PAGINAS_FROTA.map((p) => ({ nome: p.label === 'Visão geral' ? 'Frota — Visão geral' : p.label, href: p.href, area: 'Frota', sistema: 'frota', modulo: 'frota', acao: p.key.split(':')[1] })),
  ...t('Frota', 'pendencias', 'pendencias', [['Pendências Frota', '/pendencias', ['pendência do carro']]]),
  // ── Outros
  ...t('Central de Trabalho', 'tarefas', 'tickets', [
    ['Quadros (Central de Trabalho)', '/tickets/quadros', ['tickets', 'blocos', 'ticket']],
    ['Cronograma', '/cronograma', ['agenda', 'gantt']],
    ['Pendências (tarefas)', '/tarefas', ['tarefas']],
    ['Solicitações de Compras', '/tickets/compras', ['sc', 'compra']],
  ]),
  ...t('Outros', 'opa', 'opa', [
    ['Opa', '/opa'],
    ['Peças S/Estoque (Opa)', '/opa/pecas', ['peça não identificada', 'pni']],
  ]),
  ...t('Outros', 'avisos', 'avisos', [['Avisos', '/avisos']]),
  ...t('Outros', 'dashboard-agro', 'dashboard-agro', [
    ['Dashboard Agro', '/dashboard-agro'],
    ['Prospecção por CAR', '/dashboard-agro?tab=prospeccao', ['car', 'imóvel rural']],
    ['Mapa dos imóveis (CAR)', '/dashboard-agro?tab=mapa'],
  ]),
  ...t('Outros', 'conhecimento', undefined, [['Base de conhecimento', '/conhecimento', ['ajuda', 'manual']]]),
  ...t('Outros', 'configuracoes', 'admin', [['Administração', '/admin', ['usuários', 'permissões']]]),
]

/** Sem acento e minúsculo — "orcamento" acha "Orçamentos". */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Nota de quanto `alvo` casa com a busca `q` (já normalizada). Menor = melhor;
 * null = não casa. Exato < começa com < palavra começa com < contém.
 */
export function relevancia(alvo: string, q: string): number | null {
  const a = normalizar(alvo)
  if (!q) return null
  if (a === q) return 0
  if (a.startsWith(q)) return 1
  if (a.split(/[\s/(),—-]+/).some((p) => p.startsWith(q))) return 2
  if (a.includes(q)) return 3
  return null
}

/** Telas que casam com a busca, da mais exata para a menos. */
export function buscarTelas(telas: Tela[], busca: string, limite = 12): Tela[] {
  const q = normalizar(busca)
  if (!q) return []
  const notas: { tela: Tela; nota: number }[] = []
  for (const tela of telas) {
    const pelonome = relevancia(tela.nome, q)
    // Sinônimo conta um pouco menos que o nome; o módulo ("área") menos ainda.
    const pelosin = Math.min(...(tela.sinonimos || []).map((s) => relevancia(s, q)).filter((n): n is number => n !== null).map((n) => n + 1), Infinity)
    const pelaarea = relevancia(tela.area, q)
    const nota = Math.min(pelonome ?? Infinity, pelosin, pelaarea !== null ? pelaarea + 4 : Infinity)
    if (nota !== Infinity) notas.push({ tela, nota })
  }
  return notas
    .sort((x, y) => x.nota - y.nota || x.tela.nome.length - y.tela.nome.length)
    .slice(0, limite)
    .map((n) => n.tela)
}
