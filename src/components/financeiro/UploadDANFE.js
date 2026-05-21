'use client'
// Upload de foto/scan/PDF da DANFE — lê a chave NF-e (44 dígitos) por:
//   1) extração de texto (PDF vetorial — rápido e exato)
//   2) leitura do código de barras (Code-128 / ITF) na imagem ou página rasterizada do PDF
// Para casos em que o fornecedor não enviou o XML, só o papel/digital.
import { useRef, useState } from 'react'
import { Camera, CheckCircle, AlertTriangle } from 'lucide-react'
import { parseChaveNFe } from '@/lib/financeiro/nfe-parser'

/**
 * @param {{ onParsed: (dados: ReturnType<typeof parseChaveNFe>, file: File) => void }} props
 */
export default function UploadDANFE({ onParsed }) {
  const inputRef = useRef(null)
  const [estado, setEstado] = useState({ status: 'idle', erro: '', dados: null, fileName: '' })

  async function handleFile(file) {
    if (!file) return
    setEstado({ status: 'lendo', erro: '', dados: null, fileName: file.name })

    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const chaveLida = isPdf ? await lerChaveDePdf(file) : await lerChaveDeImagem(file)
      const dados = parseChaveNFe(chaveLida)
      setEstado({ status: 'ok', erro: '', dados, fileName: file.name })
      onParsed?.(dados, file)
    } catch (e) {
      setEstado({ status: 'erro', erro: e.message || String(e), dados: null, fileName: file.name })
    }
  }

  function onDrop(e) { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) handleFile(f) }
  function onDragOver(e) { e.preventDefault() }

  const isOk = estado.status === 'ok' && estado.dados
  const isErro = estado.status === 'erro'
  const isLendo = estado.status === 'lendo'

  return (
    <div style={{ width: '100%' }}>
      <input ref={inputRef} type="file" accept="image/*,application/pdf,.pdf" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => !isLendo && inputRef.current?.click()}
        style={{
          border: `2px dashed ${isOk ? '#22c55e' : isErro ? '#ef4444' : '#cbd5e1'}`,
          background: isOk ? '#f0fdf4' : isErro ? '#fef2f2' : '#f8fafc',
          borderRadius: '12px',
          padding: '18px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          cursor: isLendo ? 'wait' : 'pointer',
          transition: '0.2s',
        }}
      >
        <div style={{
          width: '40px', height: '40px', borderRadius: '50%',
          background: isOk ? '#dcfce7' : isErro ? '#fee2e2' : '#e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isOk ? <CheckCircle size={20} color="#16a34a" /> : isErro ? <AlertTriangle size={20} color="#dc2626" /> : <Camera size={20} color="#64748b" />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {isOk ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#15803d' }}>Código de barras lido</div>
              <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: '2px' }}>
                <span>Nº <strong>{estado.dados.numero}</strong></span>
                <span>Série <strong>{estado.dados.serie}</strong></span>
                <span>CNPJ <strong>{formatarCnpj(estado.dados.cnpjEmitente)}</strong></span>
                <span>{estado.dados.mesEmissao.toString().padStart(2,'0')}/{estado.dados.anoEmissao} · {estado.dados.uf}</span>
              </div>
            </>
          ) : isErro ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c' }}>Não consegui ler</div>
              <div style={{ fontSize: '12px', color: '#7f1d1d' }}>{estado.erro}</div>
            </>
          ) : isLendo ? (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Lendo código de barras...</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Aguarde...</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={14} /> Ler DANFE (foto, scan ou PDF)
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Aceita foto/JPG/PNG ou PDF da DANFE. Extraio a chave NF-e e preencho número, série e CNPJ. <strong>Valor total continua manual</strong> (não vem na chave).
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatarCnpj(d) {
  const s = String(d || '').replace(/\D/g, '')
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  return s
}

// =====================================================================
// LEITORES
// =====================================================================

/** Lê a chave (44 dígitos) de um arquivo de imagem via barcode. */
async function lerChaveDeImagem(file) {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Não consegui carregar a imagem.'))
    })
    return await decodificarBarcode(img)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Lê a chave (44 dígitos) de um PDF:
 *   1) tenta extrair texto e procurar 44 dígitos consecutivos (DANFE digital)
 *   2) cai pra rasterizar a página e decodar barcode (DANFE escaneada em PDF)
 */
async function lerChaveDePdf(file) {
  const pdfjsLib = await import('pdfjs-dist')
  // Workerless: usa o build legacy/sem-worker em ambiente Next; setar fakeWorker.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs')).default
  } catch {
    // fallback: deixa o pdfjs usar fakeWorker em-thread
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
  }

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const totalPaginas = pdf.numPages

  // 1) Tentar extrair texto e localizar a chave de 44 dígitos
  for (let p = 1; p <= totalPaginas; p++) {
    const page = await pdf.getPage(p)
    const textContent = await page.getTextContent()
    const texto = textContent.items.map((it) => ('str' in it ? it.str : '')).join(' ')
    // Procurar 44 dígitos consecutivos (chave NF-e). Tolera espaços/pontos.
    const limpo = texto.replace(/[^\d]/g, '')
    // Sliding window — procurar uma sequência de 44 dígitos
    if (limpo.length >= 44) {
      // Tentativa simples: primeiros 44 dígitos costuma ser a chave em DANFEs
      // Mas pra ser robusto, procura uma chave que comece com um cUF válido (11-53)
      for (let i = 0; i <= limpo.length - 44; i++) {
        const candidato = limpo.slice(i, i + 44)
        const cUF = candidato.slice(0, 2)
        // UFs válidas: 11-17, 21-29, 31-35, 41-43, 50-53
        if (/^(1[1-7]|2[1-9]|3[1-5]|4[1-3]|5[0-3])/.test(cUF)) {
          // sanity check: modelo deve ser 55 ou 65
          const mod = candidato.slice(20, 22)
          if (mod === '55' || mod === '65') return candidato
        }
      }
    }
  }

  // 2) Fallback: rasterizar 1ª página e decodar barcode visual
  const page = await pdf.getPage(1)
  const scale = 2.5  // escala alta pra melhorar leitura do barcode
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível no navegador.')
  await page.render({ canvasContext: ctx, viewport, canvas }).promise

  // BrowserMultiFormatReader aceita decodificar de canvas
  return await decodificarBarcodeDeCanvas(canvas)
}

/** Decodifica um barcode (Code-128 / ITF) a partir de um HTMLImageElement. */
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
      throw new Error('Nenhum código de barras encontrado. Tente uma foto mais nítida e com a DANFE inteira no enquadramento.')
    }
    throw e
  }
}

/** Decodifica barcode a partir de um <canvas> (usado pro PDF rasterizado). */
async function decodificarBarcodeDeCanvas(canvas) {
  // Converter o canvas em uma <img> e reusar o decoder
  const dataUrl = canvas.toDataURL('image/png')
  const img = new Image()
  img.src = dataUrl
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })
  return await decodificarBarcode(img)
}
