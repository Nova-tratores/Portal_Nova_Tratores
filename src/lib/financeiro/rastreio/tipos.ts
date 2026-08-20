// Rastreio de notas — tipos compartilhados entre a rota, as libs puras e a UI.
// Uma FICHA agrupa tudo que compõe um documento fiscal (conta a pagar,
// requisições, boletos/títulos, NF de entrada/saída, faturamento, anexos).

import type { TermoNormalizado } from './normalizar'

export type TipoDoc =
  | 'finan_pagar'
  | 'requisicao'
  | 'chamado_nf'
  | 'nota_entrada'
  | 'nota_saida'
  | 'titulo_omie';

export interface RefDoc {
  tipo: TipoDoc
  id: string
}

export const refKey = (r: { tipo: string; id: string }) => `${r.tipo}:${r.id}`

export interface AnexoFicha {
  origem: RefDoc
  origemLabel: string // 'Conta a pagar #12', 'Requisição #345', 'Faturamento #9'
  label: string // 'Nota fiscal', 'Boleto 2', 'XML NF-e', 'Comprovante parcela 1'…
  /** null = arquivo no Drive legado (não baixável pelo portal) */
  url: string | null
}

export interface VinculoFicha {
  id: number
  a: RefDoc
  b: RefDoc
  criado_por_nome: string | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface SecoesFicha {
  contaPagar: any[]
  requisicoes: any[]
  chamadosReceber: any[]
  nfEntrada: any[]
  nfSaida: any[]
  titulosOmie: any[]
  pastaCliente: any[]
}

export interface DocumentoFicha {
  docKey: string
  numeroNf: string | null
  chaveNfe: string | null
  contraparte: { nome: string | null; doc: string | null }
  valorRef: number | null
  vinculoManual: boolean
  secoes: SecoesFicha
  anexos: AnexoFicha[]
  vinculos: VinculoFicha[]
}

export interface RespostaRastreio {
  termo: TermoNormalizado
  fichas: DocumentoFicha[]
  avisos: string[]
}
