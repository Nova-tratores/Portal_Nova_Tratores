// Tela de Despesas (/financeiro/historico-pagar) — tipos.
//
// `DespesaRow` espelha as colunas de `finan_pagar` que a tela lê (o projeto não
// tem tipos gerados do Supabase; a lista canônica de colunas vive em COLS_FP,
// src/app/api/financeiro/rastreio/route.ts). `Despesa` é a linha já ENRIQUECIDA
// — categoria resolvida, chave de fornecedor, situação no Omie — que é o que os
// gráficos e a lista consomem.
//
// ⚠ `valor` é NUMÉRICO no banco (conferido no JSON cru do PostgREST: vem sem
// aspas). Não existe parse de string aqui, e não deve passar a existir sem
// alguém reconferir — o campo de formato misto deste projeto é outro
// (Requisicao.valor_despeza, ver lib/abastecimento/requisicoes.ts).

export interface DespesaRow {
  id: number
  fornecedor: string | null
  valor: number | null
  /** 'YYYY-MM-DD' — é DATA DE CALENDÁRIO, nunca vire Date sem UTC */
  data_vencimento: string | null
  numero_NF: string | null
  metodo: string | null
  motivo: string | null
  qtd_parcelas: number | null
  /** CSV de URLs — as três são lista, mesmo quando trazem um arquivo só */
  anexo_nf: string | null
  anexo_boleto: string | null
  anexo_requisicao: string | null
  anexo_comprovante: string | null
  status: string | null
  status_envio: string | null
  /** código da categoria Omie ('2.08.01') — o NOME vem de omie_cache */
  omie_categoria: string | null
  /** CSV de códigos de lançamento; preenchido = está no Omie */
  omie_cod_lancamento: string | null
  omie_empresa: string | null
  omie_sync_em: string | null
  /** nome de quem lançou (a coluna já guarda o nome, não o id) */
  criado_por: string | null
  /** timestamp de criação — a coluna chama `criado_em`, NÃO `created_at` */
  criado_em: string | null
}

/** De onde saiu o nome da categoria — a tela usa pra ser honesta sobre cobertura. */
export type OrigemCategoria = 'cache' | 'codigo' | 'nenhuma'

/** Situação no Omie, derivada de campos existentes (ver omie.ts). */
export type SituacaoOmie = 'enviado' | 'erro' | 'fora'

export interface Despesa extends DespesaRow {
  /** número já garantido (null vira 0) */
  valorNum: number
  /** nome da categoria pronto pra exibir; 'Sem categoria' quando não resolve */
  categoria: string
  origemCategoria: OrigemCategoria
  /** chave de agrupamento do fornecedor (slugContraparte) */
  fornecedorChave: string
  /** rótulo do fornecedor, já aparado */
  fornecedorRotulo: string
  situacaoOmie: SituacaoOmie
  /** Número do documento COMO ESTÁ NO OMIE — é por ele que se procura lá.
   *  O `omie_cod_lancamento` (2522774800) é chave interna e não serve pra busca. */
  numeroDocumento: string | null
  /** '001/003' — identifica a parcela exata no Omie */
  numeroParcela: string | null
  /** parcelas com estado de pagamento, em ordem; vazio se o título não veio */
  parcelas: ParcelaOmie[]
  /** quantas parcelas já saíram — a resposta de "isso ainda me deve algo?" */
  parcelasPagas: number
}

/** Título do Omie (tabela espelho `contas_pagar`), indexado por lançamento. */
export interface TituloOmie {
  codigo_lancamento: number | string
  numero_documento: string | null
  numero_documento_fiscal: string | null
  numero_parcela: string | null
  /** 'PAGO' | 'A VENCER' | 'ATRASADO' | 'CANCELADO' (valores reais do Omie) */
  status_titulo: string | null
  data_vencimento: string | null
  data_pagamento: string | null
  valor_documento: number | null
  valor_pago: number | null
}

export type EstadoParcela = 'paga' | 'a_vencer' | 'atrasada' | 'cancelada'

export interface ParcelaOmie {
  /** '001/003' */
  numero: string
  estado: EstadoParcela
  valor: number
  vencimento: string | null
  pagamento: string | null
  codigoLancamento: string
}

export interface PontoMes {
  /** 'YYYY-MM' */
  mes: string
  /** 'fev/26' */
  label: string
  total: number
  qtd: number
  /** mês corrente ainda em curso — a tela desenha esmaecido */
  parcial: boolean
}

export interface FatiaRanking {
  chave: string
  rotulo: string
  total: number
  qtd: number
  /** 0..1 sobre o total do recorte */
  percentual: number
  /** outras grafias que caíram na mesma chave (auditoria em tooltip) */
  variantes: string[]
  /** o balde "Outros (N)", que nunca recebe cor de identidade */
  ehOutros: boolean
}

export interface NoDia {
  /** 'YYYY-MM-DD' */
  dia: string
  /** '20' */
  numero: string
  /** 'qui' */
  diaSemana: string
  total: number
  itens: Despesa[]
}

export interface NoSemana {
  /** segunda-feira real da semana ('YYYY-MM-DD'), mesmo que caia no mês anterior */
  segunda: string
  /** primeiro e último dia EXIBIDOS (recortados pelo mês) */
  inicio: string
  fim: string
  /** '17–23 ago' */
  label: string
  total: number
  qtd: number
  dias: NoDia[]
}

export interface NoMes {
  /** 'YYYY-MM' */
  mes: string
  /** 'Agosto 2026' */
  label: string
  total: number
  qtd: number
  semanas: NoSemana[]
}

export interface ResumoDespesas {
  total: number
  qtd: number
  ticketMedio: number
  mediaMensal: number
  mesMaisCaro: { mes: string; label: string; total: number } | null
  foraDoOmie: { qtd: number; total: number }
  comErroOmie: number
  semCategoria: { qtd: number; total: number }
}
