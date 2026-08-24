// Anexos de uma despesa.
//
// As colunas de anexo são CSV de URLs — e isso NÃO é uniforme: hoje só
// `anexo_requisicao` tem vírgula de fato (8 das 25 despesas preenchidas), mas
// `anexo_boleto` já era tratado como lista na tela antiga. Tratar as três como
// lista é o certo: separar uma URL só devolve um item, e supor "uma URL" quando
// são três produz um link com as três concatenadas — que foi exatamente o
// erro corrigido aqui (o navegador abria .../req-6378.pdf,%20https://... e
// tomava 404).
//
// O rótulo sai do NOME DO ARQUIVO porque ele diz mais que a coluna: dentro de
// `anexo_requisicao` convivem o PDF da requisição, o boleto e o recibo do
// fornecedor, vindos de buckets diferentes.

import type { DespesaRow } from './tipos'

export type TipoAnexo = 'nf' | 'boleto' | 'requisicao' | 'comprovante'

export interface AnexoDespesa {
  url: string
  rotulo: string
  tipo: TipoAnexo
}

export function separarUrls(csv: string | null | undefined): string[] {
  return String(csv || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Nome legível a partir da URL do arquivo. */
function rotuloDaUrl(url: string, padrao: string): string {
  const nome = decodeURIComponent(url.split('/').pop() || '').toLowerCase()
  if (nome.includes('boleto')) return 'Boleto do fornecedor'
  if (nome.includes('recibo')) return 'Recibo do fornecedor'
  if (nome.includes('comprovante')) return 'Comprovante'
  if (nome.includes('foto_nf') || nome.includes('nota')) return 'Nota da requisição'
  const req = nome.match(/req-(\d+)/)
  if (req) return `Requisição #${req[1]}`
  return padrao
}

/** Numera só o que repete: "Boleto", mas "Boleto 1"/"Boleto 2" quando há dois. */
function numerar(itens: AnexoDespesa[]): AnexoDespesa[] {
  const contagem = new Map<string, number>()
  for (const i of itens) contagem.set(i.rotulo, (contagem.get(i.rotulo) || 0) + 1)
  const vistos = new Map<string, number>()
  return itens.map((i) => {
    if ((contagem.get(i.rotulo) || 0) < 2) return i
    const n = (vistos.get(i.rotulo) || 0) + 1
    vistos.set(i.rotulo, n)
    return { ...i, rotulo: `${i.rotulo} ${n}` }
  })
}

export function anexosDaDespesa(row: Pick<DespesaRow,
  'anexo_nf' | 'anexo_boleto' | 'anexo_requisicao'> & { anexo_comprovante?: string | null }): AnexoDespesa[] {
  const itens: AnexoDespesa[] = [
    ...separarUrls(row.anexo_nf).map((url) => ({ url, rotulo: rotuloDaUrl(url, 'Nota fiscal'), tipo: 'nf' as const })),
    ...separarUrls(row.anexo_boleto).map((url) => ({ url, rotulo: rotuloDaUrl(url, 'Boleto'), tipo: 'boleto' as const })),
    ...separarUrls(row.anexo_requisicao).map((url) => ({ url, rotulo: rotuloDaUrl(url, 'Requisição (PDF)'), tipo: 'requisicao' as const })),
    ...separarUrls(row.anexo_comprovante).map((url) => ({ url, rotulo: rotuloDaUrl(url, 'Comprovante'), tipo: 'comprovante' as const })),
  ]
  // o mesmo arquivo pode estar em duas colunas (o boleto do fornecedor vive
  // tanto em anexo_boleto quanto dentro do CSV da requisição)
  const unicos = itens.filter((it, i) => itens.findIndex((o) => o.url === it.url) === i)
  return numerar(unicos)
}
