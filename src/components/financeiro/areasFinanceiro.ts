// Áreas do Financeiro (José, 06/11/2026): para Dev e função Financeiro, o Financeiro abre num menu de áreas
// (como o dashboard) e a faixa mostra só as abas da área aberta. Pós-Vendas e Peças seguem com a faixa antiga.
// Uma tela pertence à área cujo prefixo casar com o endereço (o mais comprido ganha).

// perm: ação do Financeiro que libera a aba (pode('financeiro', perm)). Sem `perm`, vale a chave derivada do
// endereço (permDaAba). Desde 10/11/2026 cada aba tem a sua chave no Admin (decisão do usuário: "uma por aba").
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
      { nome: 'Contas do cliente', href: '/financeiro/contas-cliente', fa: 'fa-calculator', descricao: 'tudo do cliente e a dívida atualizada' },
      // criar a conta a pagar e lançar no Omie na hora (+ rascunhos das Requisições) — 12/11/2026
      { nome: 'Lançar conta', href: '/financeiro/caixa/lancar-conta', fa: 'fa-file-circle-plus', descricao: 'cria a conta a pagar e lança no Omie' },
      { nome: 'Baixar contas', href: '/financeiro/caixa/baixar-contas', fa: 'fa-circle-check', descricao: 'dar baixa no Omie', perm: 'baixa-contas' },
      // vieram do Ajustes em 09/11/2026; a chave virou financeiro:<x> em 10/11 (sql/financeiro-permissoes-abas.sql)
      { nome: 'Correção de contas', href: '/financeiro/caixa/correcao-contas', fa: 'fa-pen-to-square', descricao: 'categoria, vencimento, projeto e rateio no Omie', perm: 'correcao-contas' },
      { nome: 'Boletos de fornecedor', href: '/financeiro/caixa/boletos-fornecedor', fa: 'fa-barcode', descricao: 'boleto que junta várias NFs do fornecedor', perm: 'boletos-fornecedor' },
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

/**
 * Chave (ação do módulo financeiro) de cada aba — 10/11/2026, "uma por aba" no Admin. Derivada do endereço:
 * /financeiro/caixa/vencidos → 'vencidos', /financeiro/pessoas/folha → 'pessoas-folha', … `perm` na aba vence.
 * null = a aba não tem chave própria (Recibos: quem tem Financeiro, POS ou PPV, como sempre).
 */
export function permDaAba(a: AbaArea): string | null {
  if (a.perm) return a.perm
  const p = a.href.replace(/^\/financeiro\/?/, '')
  if (p === 'kanban-financeiro') return 'recebimentos'
  if (p === 'recibos') return null
  const m = /^(caixa|compras|pessoas|contas-do-mes|banco)\/(.+)$/.exec(p)
  if (m) return m[1] === 'caixa' ? m[2] : `${m[1] === 'contas-do-mes' ? 'contas' : m[1]}-${m[2]}`
  return p || null
}

/** Todas as chaves das abas (catálogo do Admin, explícitas, mapa de telas). */
export const CHAVES_ABAS_FINANCEIRO: { chave: string; area: string; aba: string; href: string }[] =
  AREAS_FINANCEIRO.flatMap((area) => area.abas.flatMap((a) => {
    const chave = permDaAba(a)
    return chave ? [{ chave, area: area.nome, aba: a.nome, href: a.href }] : []
  }))

/** Aba (com a área) da tela aberta — a mais específica, como areaDoEndereco. */
export function abaDoEndereco(path: string): AbaArea | null {
  let melhor: { aba: AbaArea; tam: number } | null = null
  for (const area of AREAS_FINANCEIRO) for (const a of area.abas) {
    const tam = (a.prefixo || a.href).length
    if (casa(a, path) && (!melhor || tam > melhor.tam)) melhor = { aba: a, tam }
  }
  return melhor?.aba ?? null
}

type Pode = (modulo: string, acao: string) => boolean

/** A pessoa pode abrir esta aba? (Notas fiscais seguem a financeiro:notas, como antes.) */
export const podeAba = (a: AbaArea, pode: Pode): boolean => {
  const chave = permDaAba(a)
  return !chave || pode('financeiro', chave)
}

/** Abas que a pessoa pode ver. */
export function abasVisiveis(abas: AbaArea[], comNotas: boolean, pode: Pode): AbaArea[] {
  return abas.filter((a) => (comNotas || a.href !== '/financeiro/notas') && (a.href === '/financeiro/notas' || podeAba(a, pode)))
}

/** Abas que seguem chaves antigas, NÃO explícitas (o módulo Financeiro inteiro dá): não contam para entrar nas áreas. */
export const CHAVES_ANTIGAS_FINANCEIRO: ReadonlySet<string> = new Set(['rastreio', 'notas'])

/**
 * Tem alguma aba do Financeiro novo? Decide o topo novo e o menu de áreas (antes: Dev ou função Financeiro).
 * Só as chaves próprias das abas (explícitas) contam — senão o Pós-Vendas, que tem o módulo para o kanban dele,
 * "teria" o Rastreio e cairia nas áreas.
 */
export const temAlgumaAba = (pode: Pode): boolean =>
  CHAVES_ABAS_FINANCEIRO.some((c) => !CHAVES_ANTIGAS_FINANCEIRO.has(c.chave) && pode('financeiro', c.chave))
