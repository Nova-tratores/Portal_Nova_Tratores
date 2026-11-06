// Áreas do Financeiro novo que mostram contas a pagar do Omie por bloco e por mês (06/11/2026):
// Pessoas (P1–P4, lib/financeiro/pessoas.ts) e Contas do mês (F1–F4, aqui). Mesma tela (ModuloContasTela) e
// mesma leitura no servidor (lerContasModulo); cada área tem o seu painel "no portal".
// Categorias com o nome exato do Omie (iguais na Nova e na Castro; levantadas das contas a pagar de 2026).

// fornecedores: só entra no bloco quem casar com este padrão (sem maiúscula/minúscula). Bloco com fornecedores é testado
// antes dos outros: as antecipações (B2) têm a mesma categoria dos empréstimos (B1) e se separam pelo parceiro.
export interface BlocoModulo { codigo: string; nome: string; slug: string; fa: string; cor: string; categorias: string[]; fornecedores?: string }

/** Uma conta a pagar do Omie numa área de blocos. */
export interface ContaModulo {
  codigo_lancamento: number
  nome: string | null
  categoria: string
  bloco: string
  numero_documento: string | null
  observacao: string | null
  data_vencimento: string
  data_pagamento: string | null
  valor_documento: number
  valor_pago: number
  status: string // statusDerivado: LIQUIDADO, PARCIAL, VENCIDO, A_VENCER_PROXIMO, A_VENCER
}

export const blocoDe = (blocos: BlocoModulo[], cat: string | null | undefined, nome?: string | null) =>
  [...blocos.filter((b) => b.fornecedores), ...blocos.filter((b) => !b.fornecedores)]
    .find((b) => b.categorias.includes(cat || '') && (!b.fornecedores || new RegExp(b.fornecedores, 'i').test(nome || '')))?.codigo ?? null

// IOF fica fora: é do banco (B1, empréstimos). Almoxarifado e escritório são uso e consumo (C3).
export const BLOCOS_CONTAS_MES: BlocoModulo[] = [
  {
    codigo: 'F1', nome: 'Fixas', slug: 'fixas', fa: 'fa-house-signal', cor: '#0e7490',
    categorias: ['Aluguel', 'Água e Esgoto', 'Energia Elétrica', 'Telefonia', 'Sistemas e Informática', 'Contabilidade', 'Advogados',
      'Despesas Jurídicas/Honorários Advocatício', 'Seguros', 'Documentação (Correios, Cartório, etc)', 'Despesas com Contratos (Cartório/Correios )'],
  },
  {
    codigo: 'F2', nome: 'Impostos', slug: 'impostos', fa: 'fa-landmark', cor: '#b42318',
    categorias: ['IPVA', 'IPVA/LICENCIAMENTO', 'Multa/Licenciamento Veicular', 'IRPJ', 'Contribuição Social', 'IPTU', 'ISS', 'PIS',
      'Taxa de Licenca para Funcionamento', 'Taxa Licenca para funcionamento'],
  },
  {
    codigo: 'F3', nome: 'Bens e consórcios', slug: 'bens', fa: 'fa-car', cor: '#7c3aed',
    categorias: ['Consórcio Veículos', 'Veículos', 'Máquinas e Equipamentos', 'Equipamentos de Informática', 'Móveis e Utensílios'],
  },
  {
    codigo: 'F4', nome: 'Marketing', slug: 'marketing', fa: 'fa-bullhorn', cor: '#c2410c',
    categorias: ['Marketing', 'Brindes', 'Bonificações', 'Doações', 'Folhetos/Cartões/Faixas'],
  },
]

// Banco (B1, B2, B4). B3 caixas e cartão e B5 conciliação não são contas a pagar: ficam na aba Contas correntes,
// que lê os movimentos das contas correntes. Multas (2.05.02) são do grupo financeiro do Omie, mesmo as do D.E.R.
export const BLOCOS_BANCO: BlocoModulo[] = [
  { codigo: 'B1', nome: 'Empréstimos', slug: 'emprestimos', fa: 'fa-hand-holding-dollar', cor: '#3b5bdb', categorias: ['Pagamento de Empréstimos', 'Juros sobre Empréstimos', 'IOF'] },
  {
    codigo: 'B2', nome: 'Antecipações', slug: 'antecipacoes', fa: 'fa-forward-fast', cor: '#0e7490', categorias: ['Pagamento de Empréstimos'],
    fornecedores: 'votorantim|erg risk|direitos credit',
  },
  { codigo: 'B4', nome: 'Tarifas e multas', slug: 'tarifas', fa: 'fa-receipt', cor: '#b45309', categorias: ['Tarifas Bancárias', 'Multas'] },
]
