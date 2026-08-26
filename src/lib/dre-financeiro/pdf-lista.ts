/* eslint-disable @typescript-eslint/no-explicit-any */
// Gera um PDF tabular da VISAO LISTA do Calendario DRE. Mesmas colunas da tela
// (Empresa, Terceiro, Documento, data do eixo, Status, Valor). Retorna Buffer.
// Padrao clonado de src/lib/ajustes/pdf-pedidos.ts (pdfkit, tabela manual).
/* eslint-disable @typescript-eslint/no-require-imports */
const pdfkitMod = require('pdfkit')
const PDFDocument = pdfkitMod.default || pdfkitMod

import { empresaLabel, type TituloLista } from './lista'

function fmtBRL(n: any): string {
  if (n == null || isNaN(n)) return ''
  return 'R$ ' + Number(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function fmtData(iso: any): string {
  const s = String(iso || '').slice(0, 10)
  if (!s) return ''
  const p = s.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s
}

const STATUS_LABEL: Record<string, string> = {
  LIQUIDADO: 'Pago',
  VENCIDO: 'Vencido',
  A_VENCER_PROXIMO: 'Proximo',
  A_VENCER: 'A vencer',
  PARCIAL: 'Parcial',
}

function docDe(t: TituloLista): string {
  let doc = t.numero_documento_fiscal
    ? 'NF ' + t.numero_documento_fiscal
    : t.numero_documento
      ? 'Doc ' + t.numero_documento
      : ''
  if (t.numero_parcela) doc += (doc ? ' · ' : '') + 'Parc ' + t.numero_parcela
  return doc
}

export interface GerarPDFListaArgs {
  titulo?: string
  subtitulo?: string
  titulos?: TituloLista[]
  /** rotulo da coluna de data (default 'Criacao'). */
  colunaDataLabel?: string
  /** campo de data a exibir (default 'data_inclusao'). */
  colunaDataCampo?: keyof TituloLista
}

interface Col {
  k: string
  label: string
  w: number
  alignR?: boolean
}

// Gera PDF e devolve Buffer (Promise).
export function gerarPDFLista({
  titulo,
  subtitulo,
  titulos,
  colunaDataLabel = 'Criacao',
  colunaDataCampo = 'data_inclusao',
}: GerarPDFListaArgs = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 })
      const chunks: Buffer[] = []
      doc.on('data', (c: Buffer) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))

      // Cabecalho
      doc.fontSize(16).font('Helvetica-Bold').text(titulo || 'Calendario DRE — Lista', { align: 'left' })
      if (subtitulo) doc.fontSize(9).font('Helvetica').fillColor('#666').text(subtitulo)
      doc.fontSize(8).fillColor('#999').text('Gerado em ' + new Date().toLocaleString('pt-BR'))
      doc.moveDown(0.5)
      doc.fillColor('#000')

      const cols: Col[] = [
        { k: 'empresa', label: 'Empresa', w: 55 },
        { k: 'terceiro', label: 'Terceiro', w: 300 },
        { k: 'doc', label: 'Documento', w: 130 },
        { k: 'data', label: colunaDataLabel, w: 70 },
        { k: 'status', label: 'Status', w: 70 },
        { k: 'valor', label: 'Valor', w: 90, alignR: true },
      ]
      const xStart = doc.page.margins.left
      const larguraTotal = cols.reduce((s, c) => s + c.w, 0)
      const HDR_H = 15
      const ROW_H = 13
      const yBottom = doc.page.height - doc.page.margins.bottom - ROW_H

      // Nao ler doc.y dentro do loop de colunas (evita layout "escada").
      function desenharCabec() {
        const y = doc.y
        doc.rect(xStart, y, larguraTotal, HDR_H).fill('#1f2937')
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
        let x = xStart
        cols.forEach((c) => {
          doc.text(c.label, x + 3, y + 4, { width: c.w - 6, align: c.alignR ? 'right' : 'left', lineBreak: false })
          x += c.w
        })
        doc.fillColor('#000').font('Helvetica')
        doc.y = y + HDR_H
      }

      function desenharLinha(l: Record<string, any>, alt: boolean) {
        const y = doc.y
        if (alt) doc.fillColor('#f3f4f6').rect(xStart, y, larguraTotal, ROW_H).fill()
        doc.fillColor('#111').font('Helvetica').fontSize(8)
        let x = xStart
        cols.forEach((c) => {
          const v = l[c.k]
          doc.text(v == null ? '' : String(v), x + 3, y + 3, {
            width: c.w - 6,
            align: c.alignR ? 'right' : 'left',
            lineBreak: false,
            ellipsis: true,
          })
          x += c.w
        })
        doc.y = y + ROW_H
      }

      const lista = titulos || []
      const linhas = lista.map((t) => ({
        empresa: empresaLabel(t.conta_omie),
        terceiro: t.nome_contraparte || 'Sem nome',
        doc: docDe(t),
        data: fmtData(t[colunaDataCampo]),
        status: STATUS_LABEL[t.status_derivado] || t.status_derivado || '',
        valor: fmtBRL(t.valor_documento),
      }))

      desenharCabec()
      linhas.forEach((l, i) => {
        if (doc.y > yBottom) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 })
          desenharCabec()
        }
        desenharLinha(l, i % 2 === 1)
      })

      // Rodape com total de titulos e soma dos valores.
      const total = lista.reduce((s, t) => s + (Number(t.valor_documento) || 0), 0)
      doc.moveDown(0.6)
      doc
        .fontSize(9)
        .fillColor('#111')
        .font('Helvetica-Bold')
        .text(`${lista.length} titulo(s) · Total: ${fmtBRL(total)}`)
      doc.font('Helvetica').fontSize(8).fillColor('#888').text('Relatorio gerado pelo Calendario DRE.')

      doc.end()
    } catch (e) {
      reject(e)
    }
  })
}
