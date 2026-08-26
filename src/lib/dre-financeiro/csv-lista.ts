/* eslint-disable @typescript-eslint/no-explicit-any */
// CSV (server-side) da VISAO LISTA do Calendario DRE. Espelha o export da tela
// (exportarListaCSV em .../calendario/page.js), incluindo a coluna Criacao.
// BOM + separador ';' + CRLF (Excel-BR). Retorna a string do CSV.
import { empresaLabel, type TituloLista } from './lista'

function cell(v: any): string {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function num(n: any): string {
  return (Number(n) || 0).toFixed(2).replace('.', ',')
}

function fmtData(iso: any): string {
  const s = String(iso || '').slice(0, 10)
  if (!s) return ''
  const p = s.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s
}

const HEAD = [
  'Empresa', 'Tipo', 'Terceiro', 'Documento', 'NF', 'Parcela', 'Grupo', 'Categoria', 'Departamento',
  'Emissao', 'Criacao', 'Vencimento', 'Pagamento', 'Status', 'Valor documento', 'Valor pago',
]

/** Gera o CSV (com BOM) da lista de titulos. */
export function gerarCSVLista(titulos: TituloLista[] = []): string {
  const sep = ';'
  const linhas = titulos.map((t) =>
    [
      empresaLabel(t.conta_omie),
      t.tipo === 'receber' ? 'Receber' : 'Pagar',
      t.nome_contraparte || '',
      t.numero_documento || '',
      t.numero_documento_fiscal || '',
      t.numero_parcela || '',
      t.grupo_categoria || '',
      t.descricao_categoria || '',
      t.descricao_departamento || '',
      fmtData(t.data_emissao),
      fmtData(t.data_inclusao),
      fmtData(t.data_vencimento),
      fmtData(t.data_pagamento),
      t.status_derivado || '',
      num(t.valor_documento),
      num(t.valor_pago),
    ]
      .map(cell)
      .join(sep),
  )
  return '﻿' + [HEAD.join(sep)].concat(linhas).join('\r\n') + '\r\n'
}
