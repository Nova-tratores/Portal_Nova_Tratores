/* eslint-disable @typescript-eslint/no-explicit-any */
// PDF do recibo (pdfkit). Três modelos (página de teste /financeiro/recibos/teste):
//   1 = duas vias numa A4 (cliente em cima, empresa embaixo) · 2 = A4 inteira, uma via · 3 = A5 deitada, uma via.
// O QR de cada via abre /r/<token>, que confere o recibo no banco.
/* eslint-disable @typescript-eslint/no-require-imports */
const pdfkitMod = require('pdfkit')
const PDFDocument = pdfkitMod.default || pdfkitMod
import fs from 'fs'
import path from 'path'
import QRCode from 'qrcode'
import { portalBase } from '@/lib/portal-url'
import { corpoRecibo } from './texto'
import { brl, dataPorExtenso, formatarDoc, numeroRecibo, rotuloDoc, type DadosRecibo, type EmpresaRecibo, type ModeloRecibo } from './tipos'

export interface ReciboParaPdf extends DadosRecibo {
  numero: number | null // null = prévia (ainda não emitido)
  token: string | null
  assina_nome?: string | null
  cancelado_em?: string | null
}

const TINTA = '#0f172a', CINZA = '#475569', CLARO = '#94a3b8', LINHA = '#cbd5e1', COR = '#1d4ed8'

function logoNova(): Buffer | null {
  try { return fs.readFileSync(path.join(process.cwd(), 'public', 'Logo_Nova.png')) } catch { return null }
}

function dataUrlParaBuffer(u?: string | null): Buffer | null {
  const m = /^data:image\/png;base64,(.+)$/.exec(String(u || ''))
  return m ? Buffer.from(m[1], 'base64') : null
}

interface Via {
  x: number; y: number; w: number; h: number
  fonte: number         // corpo
  rotuloVia?: string    // "Via do cliente"
}

async function desenharVia(doc: any, v: Via, r: ReciboParaPdf, emp: EmpresaRecibo, assinatura: Buffer | null, qr: Buffer | null) {
  const { x, y, w, h, fonte } = v
  const pad = Math.round(fonte * 1.6)
  const ix = x + pad, iw = w - pad * 2
  let cy = y + pad

  doc.save().roundedRect(x, y, w, h, 10).lineWidth(0.8).strokeColor(LINHA).stroke().restore()

  // ── cabeçalho: logo + empresa à esquerda, número e valor à direita
  const logo = emp.nome === 'Nova Tratores' ? logoNova() : null
  const logoH = fonte * 3.2
  let tx = ix
  if (logo) {
    try {
      const img = doc.openImage(logo)
      const logoW = Math.min(logoH * (img.width / img.height), iw * 0.22)
      doc.image(img, ix, cy, { fit: [logoW, logoH] })
      tx = ix + logoW + fonte
    } catch { /* sem logo */ }
  }
  const boxW = Math.max(140, fonte * 12)
  const tw = ix + iw - boxW - 12 - tx
  doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(fonte * 1.05).text(emp.razao_social, tx, cy, { width: tw })
  const linhasEmp = [
    [emp.cnpj ? `CNPJ ${emp.cnpj}` : '', emp.ie ? `IE ${emp.ie}` : ''].filter(Boolean).join('  ·  '),
    emp.endereco || '', emp.telefone ? `Telefone ${emp.telefone}` : '',
  ].filter(Boolean)
  doc.font('Helvetica').fontSize(fonte * 0.78).fillColor(CINZA)
  for (const l of linhasEmp) doc.text(l, tx, doc.y + 1, { width: tw })
  const fimEmp = Math.max(doc.y, cy + logoH)

  const bx = ix + iw - boxW
  doc.font('Helvetica').fontSize(fonte * 0.8).fillColor(CINZA)
    .text(v.rotuloVia ? `RECIBO  ·  ${v.rotuloVia}` : 'RECIBO', bx, cy, { width: boxW, align: 'right' })
  doc.font('Helvetica-Bold').fontSize(fonte * 1.05).fillColor(TINTA)
    .text(r.numero ? `Nº ${numeroRecibo(r.numero)}` : 'PRÉVIA', bx, doc.y + 1, { width: boxW, align: 'right' })
  const vy = doc.y + 4, vh = fonte * 2.4
  doc.save().roundedRect(bx, vy, boxW, vh, 8).fillColor('#eff6ff').fill().restore()
  doc.font('Helvetica-Bold').fontSize(fonte * 1.45).fillColor(COR)
    .text(brl(r.valor), bx, vy + (vh - fonte * 1.45) / 2 + 1, { width: boxW, align: 'center' })
  cy = Math.max(fimEmp, vy + vh) + fonte * 0.9

  doc.moveTo(ix, cy).lineTo(ix + iw, cy).lineWidth(0.6).strokeColor(LINHA).stroke()
  cy += fonte * 1.1

  // ── corpo
  doc.font('Helvetica').fontSize(fonte).fillColor(TINTA)
  doc.text(corpoRecibo(r, emp), ix, cy, { width: iw, align: 'justify', lineGap: fonte * 0.35 })
  cy = doc.y + fonte * 0.6
  if (r.observacao) {
    doc.fontSize(fonte * 0.85).fillColor(CINZA).text(`Observação: ${r.observacao}`, ix, cy, { width: iw, lineGap: 2 })
    cy = doc.y + fonte * 0.4
  }
  doc.fontSize(fonte * 0.92).fillColor(TINTA)
    .text(dataPorExtenso(r.data_pagto, r.cidade || 'Piraju - SP'), ix, cy, { width: iw, align: 'right' })

  // ── rodapé: QR à esquerda, assinatura no centro-direita (ancorados no fim da via)
  const qrS = Math.min(fonte * 6.2, 74)
  const baseY = y + h - pad
  if (qr) {
    doc.image(qr, ix, baseY - qrS, { width: qrS })
    doc.font('Helvetica').fontSize(fonte * 0.62).fillColor(CLARO)
      .text('Confira se este recibo é verdadeiro lendo o QR', ix + qrS + 6, baseY - qrS + 6, { width: fonte * 11 })
    if (r.token) doc.text(`${portalBase().replace(/^https?:\/\//, '')}/r/${r.token}`, ix + qrS + 6, doc.y + 2, { width: fonte * 13 })
  }
  const sw = Math.min(iw * 0.48, 260), sx = ix + iw - sw
  const nomeAss = r.tipo === 'recebemos' ? (r.assina_nome || emp.razao_social) : r.pessoa_nome
  const docAss = r.tipo === 'recebemos' ? (r.assina_nome ? emp.razao_social : (emp.cnpj ? `CNPJ ${emp.cnpj}` : ''))
    : (rotuloDoc(r.pessoa_doc) ? `${rotuloDoc(r.pessoa_doc)} ${formatarDoc(r.pessoa_doc)}` : '')
  const ly = baseY - fonte * 2.3
  if (assinatura && r.tipo === 'recebemos') {
    try { doc.image(assinatura, sx + sw * 0.18, ly - fonte * 3.6, { fit: [sw * 0.64, fonte * 3.5], align: 'center', valign: 'bottom' }) } catch { /* sem imagem */ }
  }
  doc.moveTo(sx, ly).lineTo(sx + sw, ly).lineWidth(0.7).strokeColor(TINTA).stroke()
  doc.font('Helvetica').fontSize(fonte * 0.85).fillColor(TINTA).text(nomeAss, sx, ly + 3, { width: sw, align: 'center' })
  if (docAss) doc.fontSize(fonte * 0.72).fillColor(CINZA).text(docAss, sx, doc.y, { width: sw, align: 'center' })

  if (r.cancelado_em) {
    doc.save().rotate(-18, { origin: [x + w / 2, y + h / 2] }).font('Helvetica-Bold').fontSize(fonte * 5)
      .fillColor('#dc2626').opacity(0.18).text('CANCELADO', x, y + h / 2 - fonte * 2.5, { width: w, align: 'center' }).restore()
  }
}

export async function gerarPdfRecibo(r: ReciboParaPdf, emp: EmpresaRecibo, modelo: ModeloRecibo, assinaturaPng?: string | null): Promise<Buffer> {
  const qr = r.token
    ? dataUrlParaBuffer(await QRCode.toDataURL(`${portalBase()}/r/${r.token}`, { margin: 0, width: 240, errorCorrectionLevel: 'M' }))
    : null
  const assinatura = r.com_assinatura === false ? null : dataUrlParaBuffer(assinaturaPng)
  const tamanho = modelo === 3 ? 'A5' : 'A4'
  const layout = modelo === 3 ? 'landscape' : 'portrait'
  const doc = new PDFDocument({ size: tamanho, layout, margin: 0, info: { Title: `Recibo ${r.numero ? numeroRecibo(r.numero) : 'prévia'} — ${emp.nome}` } })
  const partes: Buffer[] = []
  const fim = new Promise<Buffer>((ok, erro) => { doc.on('data', (c: Buffer) => partes.push(c)); doc.on('end', () => ok(Buffer.concat(partes))); doc.on('error', erro) })
  const W = doc.page.width, H = doc.page.height, M = 28

  if (modelo === 1) {
    const vh = (H - M * 2 - 26) / 2
    await desenharVia(doc, { x: M, y: M, w: W - M * 2, h: vh, fonte: 10.5, rotuloVia: 'Via do cliente' }, r, emp, assinatura, qr)
    const cy = M + vh + 13
    doc.save().dash(4, { space: 4 }).moveTo(M, cy).lineTo(W - M, cy).lineWidth(0.6).strokeColor(CLARO).stroke().undash().restore()
    doc.font('Helvetica').fontSize(7).fillColor(CLARO).text('recorte aqui', 0, cy - 9, { width: W, align: 'center' })
    await desenharVia(doc, { x: M, y: cy + 13, w: W - M * 2, h: vh, fonte: 10.5, rotuloVia: 'Via da empresa' }, r, emp, assinatura, qr)
  } else if (modelo === 2) {
    await desenharVia(doc, { x: M + 8, y: M + 8, w: W - (M + 8) * 2, h: H * 0.6, fonte: 13 }, r, emp, assinatura, qr)
  } else {
    await desenharVia(doc, { x: 20, y: 20, w: W - 40, h: H - 40, fonte: 10.5 }, r, emp, assinatura, qr)
  }
  doc.end()
  return fim
}
