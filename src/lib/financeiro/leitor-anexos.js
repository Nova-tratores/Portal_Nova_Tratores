'use client'
// =====================================================================
// LEITOR DE ANEXOS — extrai chave NF-e e código de barras de boleto a
// partir de arquivos já anexados (URLs do storage). Roda no browser.
//
// - Chave NF-e: aceita XML (parse direto), PDF e imagem (código de barras).
// - Código de barras do boleto: PDF (linha digitável no texto ou barcode
//   ITF rasterizado) e imagem (barcode ITF).
// =====================================================================
import { parseNFeXML } from './nfe-parser'
import { acharChaveNFe } from './chave-nfe'

// ---------------------------------------------------------------------
// Download do anexo (URL pública do storage) → File
// ---------------------------------------------------------------------
async function baixarAnexo(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Não consegui baixar o anexo (HTTP ${res.status}).`)
  const blob = await res.blob()
  const nome = (url.split('?')[0].split('/').pop()) || 'anexo'
  return new File([blob], nome, { type: blob.type || 'application/octet-stream' })
}

function tipoArquivo(file) {
  const nome = (file.name || '').toLowerCase()
  const mime = (file.type || '').toLowerCase()
  if (mime.includes('xml') || /\.xml$/.test(nome)) return 'xml'
  if (mime.includes('pdf') || /\.pdf$/.test(nome)) return 'pdf'
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/.test(nome)) return 'image'
  return 'outro'
}

// ---------------------------------------------------------------------
// Barcode (Code-128 / ITF) — via @zxing
// ---------------------------------------------------------------------
async function decodificarBarcode(imgEl) {
  const { BrowserMultiFormatReader, NotFoundException } = await import('@zxing/browser')
  const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.ITF])
  hints.set(DecodeHintType.TRY_HARDER, true)
  const reader = new BrowserMultiFormatReader(hints)
  try {
    const result = await reader.decodeFromImageElement(imgEl)
    return result.getText()
  } catch (e) {
    if (e instanceof NotFoundException || (e && e.name === 'NotFoundException')) {
      throw new Error('Nenhum código de barras encontrado no anexo.')
    }
    throw e
  }
}

async function imagemDeFile(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Não consegui carregar a imagem do anexo.'))
    })
    return await decodificarBarcode(img)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function imagemDeCanvas(canvas) {
  const dataUrl = canvas.toDataURL('image/png')
  const img = new Image()
  img.src = dataUrl
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject })
  return await decodificarBarcode(img)
}

// ---------------------------------------------------------------------
// PDF — texto e rasterização (pdfjs-dist)
// ---------------------------------------------------------------------
async function carregarPdf(file) {
  const pdfjsLib = await import('pdfjs-dist')
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs')).default
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  }
  const arrayBuffer = await file.arrayBuffer()
  return await pdfjsLib.getDocument({ data: arrayBuffer }).promise
}

async function textoDePdf(pdf) {
  let texto = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    texto += ' ' + tc.items.map((it) => ('str' in it ? it.str : '')).join(' ')
  }
  return texto
}

async function canvasDePdf(pdf, pagina = 1) {
  const page = await pdf.getPage(pagina)
  const viewport = page.getViewport({ scale: 2.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível no navegador.')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return canvas
}

// (validação/decomposição da chave NF-e vive em ./chave-nfe.ts — lib pura,
// compartilhada com o rastreio de notas no servidor)

/** Lê a chave NF-e (44 díg) do anexo de NF. Lança Error se não conseguir. */
export async function lerChaveNFeDeUrl(url) {
  const file = await baixarAnexo(url)
  const tipo = tipoArquivo(file)

  if (tipo === 'xml') {
    const texto = await file.text()
    const dados = parseNFeXML(texto)
    if (dados.chave && dados.chave.length === 44) return dados.chave
    throw new Error('XML lido, mas sem chave de 44 dígitos.')
  }

  if (tipo === 'pdf') {
    const pdf = await carregarPdf(file)
    const texto = await textoDePdf(pdf)
    const naTexto = acharChaveNFe(texto)
    if (naTexto) return naTexto
    // fallback: barcode da 1ª página rasterizada
    const canvas = await canvasDePdf(pdf, 1)
    const lido = await imagemDeCanvas(canvas)
    const chave = acharChaveNFe(lido)
    if (chave) return chave
    throw new Error('PDF lido, mas não encontrei a chave NF-e (44 dígitos).')
  }

  if (tipo === 'image') {
    const lido = await imagemDeFile(file)
    const chave = acharChaveNFe(lido)
    if (chave) return chave
    throw new Error('Imagem lida, mas o código de barras não é uma chave NF-e válida.')
  }

  throw new Error('Formato de anexo não suportado para leitura da chave NF-e.')
}
