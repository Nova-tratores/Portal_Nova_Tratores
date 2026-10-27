// Conferência de preço dos itens de um PPV / Orçamento contra o cadastro e o custo.
// Puro (sem banco): a rota /api/ppv/conferir-precos lê o cadastro (Produtos_Completos)
// e o custo (produtos.cmc) e chama conferirPrecos().
//
// Origem (OS-0846, 22/10/2026): Peças reajustou 7 peças na Omie às 13h; às 16h28 o PPV
// ofereceu os preços ANTIGOS (a tabela do PPV estava desatualizada) e a OS saiu
// R$ 3.883,12 abaixo do orçamento — 4 itens abaixo do custo. Nada avisava.

export type ContaPreco = 'NOVA' | 'CASTRO'

export type AvisoPreco =
  | 'diferente_cadastro' // preço do item ≠ preço de venda atual do cadastro
  | 'abaixo_custo'       // preço unitário < custo (CMC)
  | 'sem_custo'          // sem CMC no sistema (peça de encomenda): margem não conferida
  | 'sem_cadastro'       // código não está no cadastro de preços

export interface ItemParaConferir {
  codigo: string
  preco: number
  quantidade: number
  conta?: ContaPreco | null
}

export interface PrecoCadastro { codigo: string; conta: ContaPreco; preco: number; descricao?: string }
export interface CustoCadastro { codigo: string; conta: ContaPreco; cmc: number }

export interface ItemConferido {
  codigo: string
  conta: ContaPreco | null
  preco: number
  quantidade: number
  precoCadastro: number | null
  /** Descrição do produto no cadastro (null = código não cadastrado). */
  descricaoCadastro: string | null
  custo: number | null
  avisos: AvisoPreco[]
  /** (cadastro − preço) × qtd: positivo = o item está cobrando A MENOS que o cadastro. */
  diferencaTotal: number
  /** (custo − preço) × qtd quando abaixo do custo; 0 nos outros casos. */
  prejuizo: number
}

export interface ResumoConferencia {
  diferentes: number
  abaixoCusto: number
  semCusto: number
  semCadastro: number
  /** Soma de diferencaTotal dos itens diferentes do cadastro. */
  diferencaTotal: number
  prejuizo: number
}

/** Diferença tolerada: 1% do preço do cadastro (mín. R$ 0,05) — absorve arredondamento
 *  de centavos (ex.: orçamento 849,94 × cadastro 850,00). */
export const TOLERANCIA_PERC = 0.01
export const TOLERANCIA_MIN = 0.05

const r2 = (n: number) => Math.round(n * 100) / 100
const chave = (s: string) => String(s || '').trim().toUpperCase()

/** Conta do item do PPV pelo campo `empresa` da movimentação (mesma regra do PPVDrawer). */
export function contaDoItemPPV(empresa: string | null | undefined): ContaPreco {
  return String(empresa || '').toLowerCase().includes('primari') ? 'CASTRO' : 'NOVA'
}

/** Conta de uma linha do cadastro (Produtos_Completos tem conta_omie e/ou Empresa). */
export function contaDaLinha(contaOmie: unknown, empresa: unknown): ContaPreco {
  const c = String(contaOmie || '').toUpperCase()
  if (c === 'CASTRO' || c === 'NOVA') return c
  return String(empresa || '').toLowerCase().includes('castro') ? 'CASTRO' : 'NOVA'
}

/** Escolhe a linha do código: a da conta pedida (sem conta, a NOVA); senão a que houver. */
function escolher<T extends { codigo: string; conta: ContaPreco }>(linhas: T[], codigo: string, conta?: ContaPreco | null): T | null {
  const doCodigo = linhas.filter((l) => chave(l.codigo) === chave(codigo))
  if (doCodigo.length === 0) return null
  return doCodigo.find((l) => l.conta === (conta || 'NOVA')) ?? doCodigo[0]
}

export function precoDifere(preco: number, cadastro: number): boolean {
  const tol = Math.max(TOLERANCIA_MIN, Math.abs(cadastro) * TOLERANCIA_PERC)
  return Math.abs(preco - cadastro) > tol
}

export function conferirPrecos(
  itens: ItemParaConferir[],
  cadastro: PrecoCadastro[],
  custos: CustoCadastro[],
): { itens: ItemConferido[]; resumo: ResumoConferencia } {
  const saida: ItemConferido[] = []
  for (const it of itens) {
    const codigo = String(it.codigo || '').trim()
    if (!codigo) continue
    const preco = Number(it.preco) || 0
    const qtd = Number(it.quantidade) || 0
    const conta = it.conta ?? null
    const cad = escolher(cadastro, codigo, conta)
    const cus = escolher(custos, codigo, conta ?? cad?.conta ?? null)
    const precoCadastro = cad && cad.preco > 0 ? cad.preco : null
    const custo = cus && cus.cmc > 0 ? r2(cus.cmc) : null

    const avisos: AvisoPreco[] = []
    if (!cad) avisos.push('sem_cadastro')
    else if (precoCadastro !== null && precoDifere(preco, precoCadastro)) avisos.push('diferente_cadastro')
    if (custo !== null && preco < custo) avisos.push('abaixo_custo')
    if (custo === null) avisos.push('sem_custo')

    saida.push({
      codigo, conta: conta ?? cad?.conta ?? null, preco, quantidade: qtd, precoCadastro, descricaoCadastro: cad ? (cad.descricao ?? "") : null, custo, avisos,
      diferencaTotal: avisos.includes('diferente_cadastro') && precoCadastro !== null ? r2((precoCadastro - preco) * qtd) : 0,
      prejuizo: avisos.includes('abaixo_custo') && custo !== null ? r2((custo - preco) * qtd) : 0,
    })
  }
  const resumo: ResumoConferencia = {
    diferentes: saida.filter((i) => i.avisos.includes('diferente_cadastro')).length,
    abaixoCusto: saida.filter((i) => i.avisos.includes('abaixo_custo')).length,
    semCusto: saida.filter((i) => i.avisos.includes('sem_custo')).length,
    semCadastro: saida.filter((i) => i.avisos.includes('sem_cadastro')).length,
    diferencaTotal: r2(saida.reduce((s, i) => s + i.diferencaTotal, 0)),
    prejuizo: r2(saida.reduce((s, i) => s + i.prejuizo, 0)),
  }
  return { itens: saida, resumo }
}

/** Tem algo que mereça a atenção de quem está lançando/faturando? (sem_custo sozinho não). */
export function temAlerta(resumo: ResumoConferencia): boolean {
  return resumo.diferentes > 0 || resumo.abaixoCusto > 0
}
