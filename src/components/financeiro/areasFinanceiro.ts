// Áreas do Financeiro (José, 06/11/2026): para Dev e função Financeiro, o Financeiro abre num menu de áreas
// (como o dashboard) e a faixa mostra só as abas da área aberta. Pós-Vendas e Peças seguem com a faixa antiga.
// Uma tela pertence à área cujo prefixo casar com o endereço (o mais comprido ganha).

// perm: permissão exigida para a aba aparecer: 'acao' = pode('financeiro', acao); 'modulo:acao' = pode(modulo, acao)
// (as telas de contas que vieram do Ajustes mantêm a chave ajustes:*); sem perm = todos da área
export type AbaArea = { nome: string; href: string; fa: string; prefixo?: string; descricao?: string; perm?: string }
// largo: ocupa dois lugares no menu (7 áreas + 1 = 8 lugares: as linhas fecham sem buraco)
export type AreaFinanceiro = { id: string; nome: string; descricao: string; fa: string; cor: string; abas: AbaArea[]; emMontagem?: boolean; largo?: boolean }

export const AREAS_FINANCEIRO: AreaFinanceiro[] = [
  {
    id: 'recebimentos', nome: 'Recebimentos', descricao: 'Cada venda faturada, da nota até o dinheiro entrar', fa: 'fa-table-columns', cor: '#16a34a',
    abas: [
      { nome: 'Recebimentos', href: '/financeiro/kanban-financeiro', fa: 'fa-table-columns', descricao: 'da nota ao dinheiro, venda por venda' },
      { nome: 'Rastreio', href: '/financeiro/rastreio', fa: 'fa-magnifying-glass', descricao: 'acha nota, boleto ou requisição' },
    ],
  },
  {
    id: 'caixa', nome: 'Caixa', descricao: 'O dia, o calendário de contas e o que está vencido', fa: 'fa-wallet', cor: '#2563eb', largo: true,
    abas: [
      { nome: 'Hoje', href: '/financeiro/hoje', fa: 'fa-sun', descricao: 'vence hoje, vencido e o que entrou' },
      { nome: 'Calendário', href: '/financeiro/caixa/calendario', fa: 'fa-calendar-days', descricao: 'um dia por vez, contas a pagar e a receber' },
      { nome: 'Vencidos', href: '/financeiro/caixa/vencidos', fa: 'fa-triangle-exclamation', descricao: 'por cliente, com juros e cobrança' },
      // Contas do cliente/fornecedor + calculadora de dívida (09/11/2026)
      { nome: 'Contas do cliente', href: '/financeiro/contas-cliente', fa: 'fa-calculator', descricao: 'tudo do cliente e a dívida atualizada', perm: 'contas-cliente' },
      { nome: 'Baixar contas', href: '/financeiro/caixa/baixar-contas', fa: 'fa-circle-check', descricao: 'dar baixa no Omie', perm: 'ajustes:baixa-contas' },
      // vieram do Ajustes em 09/11/2026, com a mesma permissão de antes
      { nome: 'Correção de contas', href: '/financeiro/caixa/correcao-contas', fa: 'fa-pen-to-square', descricao: 'categoria, vencimento, projeto e rateio no Omie', perm: 'ajustes:correcao-contas' },
      { nome: 'Boletos de fornecedor', href: '/financeiro/caixa/boletos-fornecedor', fa: 'fa-barcode', descricao: 'boleto que junta várias NFs do fornecedor', perm: 'ajustes:boletos-fornecedor' },
    ],
  },
  {
    id: 'compras', nome: 'Compras', descricao: 'Mercadoria, tratores, uso e consumo, frete e serviços, com o boleto junto', fa: 'fa-cart-shopping', cor: '#b45309',
    abas: [
      { nome: 'Mercadoria', href: '/financeiro/compras/mercadoria', fa: 'fa-boxes-stacked', descricao: 'peças e implementos para revenda' },
      { nome: 'Tratores', href: '/financeiro/compras/tratores', fa: 'fa-tractor', descricao: 'parcelas dos tratores do estoque' },
      { nome: 'Uso e consumo', href: '/financeiro/compras/uso-e-consumo', fa: 'fa-screwdriver-wrench', descricao: 'oficina, escritório e limpeza' },
      { nome: 'Frete', href: '/financeiro/compras/frete', fa: 'fa-truck', descricao: 'transporte de compras e máquinas' },
      { nome: 'Serviços', href: '/financeiro/compras/servicos', fa: 'fa-handshake', descricao: 'serviços contratados de fora' },
      { nome: 'Devoluções', href: '/financeiro/compras/devolucoes', fa: 'fa-rotate-left', descricao: 'dinheiro devolvido a clientes' },
    ],
  },
  {
    id: 'pessoas', nome: 'Pessoas', descricao: 'Folha, benefícios, comissões, viagens e alimentação', fa: 'fa-users', cor: '#7c3aed',
    abas: [
      { nome: 'Folha', href: '/financeiro/pessoas/folha', fa: 'fa-money-check-dollar', descricao: 'salários e encargos do mês' },
      { nome: 'Benefícios', href: '/financeiro/pessoas/beneficios', fa: 'fa-heart-pulse', descricao: 'seguro, transporte, saúde' },
      { nome: 'Comissões', href: '/financeiro/pessoas/comissoes', fa: 'fa-percent', descricao: 'o que a Gestão calculou e o Omie' },
      { nome: 'Viagens e alimentação', href: '/financeiro/pessoas/viagens', fa: 'fa-utensils', descricao: 'restaurantes e requisições' },
    ],
  },
  {
    id: 'contas-do-mes', nome: 'Contas do mês', descricao: 'Fixas, impostos, bens e consórcios, marketing', fa: 'fa-calendar-check', cor: '#0e7490',
    abas: [
      { nome: 'Fixas', href: '/financeiro/contas-do-mes/fixas', fa: 'fa-house-signal', descricao: 'aluguel, água, luz, sistemas, contador' },
      { nome: 'Impostos', href: '/financeiro/contas-do-mes/impostos', fa: 'fa-landmark', descricao: 'impostos e taxas, IPVA e licenciamento' },
      { nome: 'Bens e consórcios', href: '/financeiro/contas-do-mes/bens', fa: 'fa-car', descricao: 'parcelas de veículos, máquinas e consórcio' },
      { nome: 'Marketing', href: '/financeiro/contas-do-mes/marketing', fa: 'fa-bullhorn', descricao: 'marketing, brindes e bonificações' },
    ],
  },
  {
    id: 'banco', nome: 'Banco', descricao: 'Empréstimos, antecipações, tarifas e as contas correntes', fa: 'fa-building-columns', cor: '#3b5bdb',
    abas: [
      { nome: 'Empréstimos', href: '/financeiro/banco/emprestimos', fa: 'fa-hand-holding-dollar', descricao: 'parcelas, juros e IOF' },
      { nome: 'Antecipações', href: '/financeiro/banco/antecipacoes', fa: 'fa-forward-fast', descricao: 'duplicatas antecipadas e o juro' },
      { nome: 'Tarifas e multas', href: '/financeiro/banco/tarifas', fa: 'fa-receipt', descricao: 'tarifas bancárias e multas' },
      { nome: 'Contas correntes', href: '/financeiro/banco/contas-correntes', fa: 'fa-wallet', descricao: 'o que entrou e saiu de cada conta' },
    ],
  },
  {
    id: 'documentos', nome: 'Documentos', descricao: 'Recibos, notas fiscais e o relatório de despesas', fa: 'fa-file-lines', cor: '#475569',
    abas: [
      { nome: 'Recibos', href: '/financeiro/recibos', fa: 'fa-file-signature', prefixo: '/financeiro/recibos', descricao: 'recibos de pagamento' },
      { nome: 'Notas fiscais', href: '/financeiro/notas', fa: 'fa-file-invoice', descricao: 'PDF e XML das notas' },
      { nome: 'Relatório', href: '/financeiro/relatorio-pagar', fa: 'fa-chart-column', descricao: 'relatório de despesas' },
    ],
  },
]

const casa = (a: AbaArea, path: string) => path === a.href || path.startsWith(`${a.prefixo || a.href}/`)

/** Área da tela aberta (ou null: o menu de áreas e as telas soltas, como Configurações). */
export function areaDoEndereco(path: string): AreaFinanceiro | null {
  let melhor: { area: AreaFinanceiro; tam: number } | null = null
  for (const area of AREAS_FINANCEIRO) for (const a of area.abas) {
    const tam = (a.prefixo || a.href).length
    if (casa(a, path) && (!melhor || tam > melhor.tam)) melhor = { area, tam }
  }
  return melhor?.area ?? null
}

export const abaAtiva = (a: AbaArea, path: string) => casa(a, path)

/** Abas que a pessoa pode ver: Notas fiscais pela financeiro:notas (comNotas) e as com `perm` pelo pode(). */
export function abasVisiveis(abas: AbaArea[], comNotas: boolean, pode: (modulo: string, acao: string) => boolean): AbaArea[] {
  const libera = (perm: string) => { const [m, x] = perm.includes(':') ? perm.split(':') : ['financeiro', perm]; return pode(m, x) }
  return abas.filter((a) => (comNotas || a.href !== '/financeiro/notas') && (!a.perm || libera(a.perm)))
}
