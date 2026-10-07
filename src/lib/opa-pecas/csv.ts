// CSV das Peças Não Identificadas: padrão do portal para o Excel pt-BR —
// UTF-8 com BOM, separador ';', CRLF, decimal com vírgula. Gera a partir da
// MESMA lista filtrada da tela.

import { codigoDefinitivo, fmtDataHora, numeroCsv, textoAplicacoes, textoLocal } from './regras'
import { ROTULO_QUALIDADE, ROTULO_STATUS, type Item, type Nomes } from './tipos'

export const BOM = '﻿'

export const COLUNAS_CSV = [
  'Código', 'Código existente (fabricante)', 'Descrição', 'Quantidade', 'Qualidade', 'Status',
  'Não identificável', 'Aplicação', 'Preço sugerido (R$)', 'Valor total (R$)', 'Localização', 'Desfecho (o que aconteceu)', 'Encerrado em',
  'Observações', 'Fotos', 'Etiqueta impressa em', 'Criado por', 'Criado em', 'Atualizado por', 'Atualizado em',
] as const

export function celulaCsv(v: string | number | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function linhaCsv(i: Item, nomes: Nomes): string[] {
  const valor = i.preco_sugerido == null ? null : Math.round(i.quantidade * i.preco_sugerido * 100) / 100
  return [
    codigoDefinitivo(i.codigo) ? i.codigo : '',
    i.codigo_fabricante || '',
    i.descricao || '',
    String(i.quantidade),
    ROTULO_QUALIDADE[i.qualidade],
    ROTULO_STATUS[i.status],
    i.nao_identificavel ? 'Sim' : 'Não',
    textoAplicacoes(i, nomes),
    numeroCsv(i.preco_sugerido),
    numeroCsv(valor),
    textoLocal(i, nomes.locais),
    i.desfecho || i.motivo_descarte || '',
    fmtDataHora(i.encerrado_em),
    i.observacoes || '',
    String(i.fotos.length),
    fmtDataHora(i.etiqueta_impressa_em),
    nomes.usuarios[i.criado_por] || '',
    fmtDataHora(i.criado_em),
    (i.atualizado_por && nomes.usuarios[i.atualizado_por]) || '',
    fmtDataHora(i.atualizado_em),
  ]
}

export function gerarCsv(itens: Item[], nomes: Nomes): string {
  const linhas = [[...COLUNAS_CSV], ...itens.map((i) => linhaCsv(i, nomes))]
  return BOM + linhas.map((l) => l.map(celulaCsv).join(';')).join('\r\n') + '\r\n'
}

export function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
