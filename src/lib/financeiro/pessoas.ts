// Aba Pessoas do Financeiro novo (06/11/2026; docs/financeiro-novo-06-11.md): os blocos P1 a P4 e as
// categorias do Omie de cada um (nomes iguais na Nova e na Castro; levantados das contas a pagar de 2026).
// "Vale Refeição" é o pagamento direto aos restaurantes onde a equipe come: fica no P4, não no P2.

export type CodigoPessoas = 'P1' | 'P2' | 'P3' | 'P4'

// slug = endereço da aba dentro do módulo (/financeiro/pessoas/<slug>); fa e cor = ícone e cor da aba
export const BLOCOS_PESSOAS: Array<{ codigo: CodigoPessoas; nome: string; slug: string; fa: string; cor: string; categorias: string[] }> = [
  { codigo: 'P1', nome: 'Folha', slug: 'folha', fa: 'fa-money-check-dollar', cor: '#7c3aed', categorias: ['Salários', 'Adiantamento', 'Férias', 'Rescisões', 'INSS', 'FGTS', 'IRRF'] },
  { codigo: 'P2', nome: 'Benefícios', slug: 'beneficios', fa: 'fa-heart-pulse', cor: '#0e7490', categorias: ['Seguro de Vida', 'Vale Transporte', 'Assistência Médica', 'Outros Benefícios'] },
  { codigo: 'P3', nome: 'Comissões', slug: 'comissoes', fa: 'fa-percent', cor: '#b45309', categorias: ['Comissões'] },
  { codigo: 'P4', nome: 'Viagens e alimentação', slug: 'viagens', fa: 'fa-utensils', cor: '#12805c', categorias: ['Vale Refeição', 'Hospedagem', 'Passagens', 'Pedagio'] },
]

export const CATEGORIAS_PESSOAS = BLOCOS_PESSOAS.flatMap((b) => b.categorias)

export const blocoDaCategoria = (cat: string | null | undefined): CodigoPessoas | null =>
  BLOCOS_PESSOAS.find((b) => b.categorias.includes(cat || ''))?.codigo ?? null

/** Uma conta a pagar do Omie na aba Pessoas. */
export interface ContaPessoas {
  codigo_lancamento: number
  nome: string | null
  categoria: string
  bloco: CodigoPessoas
  numero_documento: string | null
  observacao: string | null
  data_vencimento: string
  data_pagamento: string | null
  valor_documento: number
  valor_pago: number
  status: string // statusDerivado: LIQUIDADO, PARCIAL, VENCIDO, A_VENCER_PROXIMO, A_VENCER
}

/** Comissão calculada no portal (Gestão Pós-Vendas). */
export interface ComissaoPessoas { id: string; tecnico: string; mes: string; valor: number; status: string }

/** Requisição de Alimentação do portal. */
export interface AlimentacaoPessoas {
  id: number; titulo: string | null; solicitante: string | null; data: string; status: string
  valor: number; ordem_servico: string | null; fornecedor: string | null
}

export interface RespostaPessoas {
  mes: string
  conta: string
  contas: ContaPessoas[]
  comissoes: ComissaoPessoas[]
  /** mês a que as comissões se referem (o anterior ao escolhido: a comissão de outubro é paga em novembro) */
  mesComissoes: string
  alimentacao: AlimentacaoPessoas[]
}
