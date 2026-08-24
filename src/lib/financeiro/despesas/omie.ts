// Situação da despesa no Omie — derivada de colunas que já existem, sem coluna
// nova e sem consultar o Omie.
//
// Fonte da verdade é `omie_cod_lancamento`: quem tem código FOI lançado (é o
// código que o Omie devolve no envio). `status_envio` sozinho não serve — ele
// tem 'rascunho' em massa (51 das 71 linhas) e diz respeito ao preenchimento do
// formulário, não ao que existe do outro lado.
//
// Medido em 21/08/2026: das 38 despesas concluídas, 15 estão no Omie e 23 não —
// e essas 23 são todas de fev–mai/2026, anteriores à adoção da integração. Ou
// seja, "fora do Omie" é ACERVO, não vazamento em curso: a interface não deve
// gritar vermelho por isso (só o estado 'erro' pede ação).

import type { DespesaRow, EstadoParcela, SituacaoOmie } from './tipos'

export function situacaoOmie(row: Pick<DespesaRow, 'omie_cod_lancamento' | 'status_envio'>): SituacaoOmie {
  if (String(row.omie_cod_lancamento || '').trim()) return 'enviado'
  if (String(row.status_envio || '').trim().toLowerCase() === 'erro') return 'erro'
  return 'fora'
}

/** Códigos de lançamento (a coluna é CSV — parcelado gera um por parcela). */
export function codigosLancamento(row: Pick<DespesaRow, 'omie_cod_lancamento'>): string[] {
  return String(row.omie_cod_lancamento || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const ROTULO_OMIE: Record<SituacaoOmie, string> = {
  enviado: 'No Omie',
  erro: 'Falha no envio',
  fora: 'Fora do Omie',
}

// Endereço do módulo financeiro no Omie, por empresa.
//
// O Omie NÃO tem link por título: a barra de endereços mostra sempre
// `.../gestao/<empresa>/#FIN`, sem o id da conta a pagar. Então o melhor que dá
// pra fazer é abrir o financeiro da empresa CERTA com o número do documento já
// copiado — um clique e um colar, em vez de procurar a empresa antes.
//
// O slug do meio é de CADA empresa e não dá pra deduzir a partir do outro —
// por isso ficam os dois escritos. Empresa fora deste mapa não ganha botão:
// melhor faltar botão do que abrir o financeiro da empresa errada.
const OMIE_GESTAO: Record<string, string> = {
  'NOVA TRATORES': 'https://app.omie.com.br/gestao/nova-0xxdawbp/#FIN',
  'CASTRO PECAS': 'https://app.omie.com.br/gestao/castro-0xz9n3c0/#FIN',
}

/** Sem acento e em caixa alta: o nome da empresa é TEXTO LIVRE em várias
 *  tabelas, e "Castro Peças" já aparece escrito com e sem cedilha no projeto —
 *  casar por igualdade exata deixaria o botão sumir sem explicação. */
const chaveEmpresa = (nome: unknown) =>
  String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase()

export function urlOmieFinanceiro(empresa: string | null | undefined): string | null {
  return OMIE_GESTAO[chaveEmpresa(empresa)] || null
}

// Estado da parcela no Omie. `status_titulo` traz os quatro valores reais
// medidos na base: PAGO, A VENCER, ATRASADO e CANCELADO. Qualquer coisa fora
// disso cai em 'a_vencer' — nunca em 'paga', porque supor pagamento é o erro
// caro dos dois.
export function estadoParcela(status: string | null | undefined): EstadoParcela {
  const s = String(status || '').trim().toUpperCase()
  if (s === 'PAGO') return 'paga'
  if (s === 'ATRASADO') return 'atrasada'
  if (s === 'CANCELADO') return 'cancelada'
  return 'a_vencer'
}

export const ROTULO_PARCELA: Record<EstadoParcela, string> = {
  paga: 'Paga',
  a_vencer: 'A vencer',
  atrasada: 'Atrasada',
  cancelada: 'Cancelada',
}

/** Ordena por número de parcela ('001/003' → 1). Sem número, mantém a ordem. */
export function ordemParcela(numero: string | null | undefined): number {
  const m = String(numero || '').match(/^(\d+)/)
  return m ? Number(m[1]) : 0
}
