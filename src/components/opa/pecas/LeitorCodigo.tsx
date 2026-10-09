'use client'
// Leitor da etiqueta pela câmera, dentro do portal: lê o QR (link público
// /e/<chave>) e também código de barras Code 128 com o código PNI. A câmera
// nativa do celular já abre o QR sozinha; isto aqui serve para quem está no
// portal. Sem câmera (ou no PC): digitar o código, ou usar a pistola leitora.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Keyboard, ScanBarcode, X } from 'lucide-react'
import { botao, INP, LARANJA } from './comum'

/** Texto lido/digitado → código da peça ("123", "pni-123", link do QR). */
export function normalizarCodigo(texto: string): string | null {
  const t = texto.trim()
  const doLink = t.match(/\/opa\/pecas\/([^/?#]+)/)
  const bruto = (doLink ? decodeURIComponent(doLink[1]) : t).toUpperCase().replace(/\s+/g, '')
  const m = bruto.match(/^(?:PNI-?)?([0-9]{1,9})$/)
  if (m) return 'PNI-' + m[1].padStart(6, '0')
  return bruto.length > 0 && bruto.length <= 40 ? bruto : null
}

/** `estilo` sobrescreve o visual (ex.: dentro da faixa colorida do Opa). */
export function BotaoLerCodigo({ estilo }: { estilo?: React.CSSProperties } = {}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Ler o QR da etiqueta" style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
        border: '1.5px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13.5, fontWeight: 800,
        ...estilo,
      }}><ScanBarcode size={16} /> Ler código</button>
      {aberto && <LeitorCodigo onFechar={() => setAberto(false)} />}
    </>
  )
}

function LeitorCodigo({ onFechar }: { onFechar: () => void }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [semCamera, setSemCamera] = useState(false)
  const [digitado, setDigitado] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const abrir = useCallback((texto: string) => {
    const publico = texto.match(/\/e\/([0-9a-f]{32})/)
    const codigo = publico ? null : normalizarCodigo(texto)
    if (!publico && !codigo) { setErro('Código não reconhecido.'); return }
    try { navigator.vibrate?.(80) } catch { /* sem vibração */ }
    onFechar()
    router.push(publico ? `/e/${publico[1]}` : `/opa/pecas/${encodeURIComponent(codigo!)}`)
  }, [onFechar, router])

  // a leitura chega por callback do zxing: lê sempre a versão atual via ref
  const abrirRef = useRef(abrir)
  useEffect(() => { abrirRef.current = abrir }, [abrir])

  useEffect(() => {
    let parar: (() => void) | null = null
    let vivo = true
    ;(async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem câmera')
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'), import('@zxing/library'),
        ])
        const dicas = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]]])
        const leitor = new BrowserMultiFormatReader(dicas)
        let lido = false
        const controles = await leitor.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
          videoRef.current!,
          (r) => { if (r && !lido) { lido = true; abrirRef.current(r.getText()) } },
        )
        if (!vivo) { controles.stop(); return }
        parar = () => controles.stop()
      } catch {
        if (vivo) setSemCamera(true)
      }
    })()
    return () => { vivo = false; try { parar?.() } catch { /* já parado */ } }
  }, [])

  return (
    <div role="dialog" aria-modal="true" aria-label="Ler código da peça" style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 14,
    }}>
      <button type="button" onClick={onFechar} aria-label="Fechar" style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 20, width: 40, height: 40, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={20} />
      </button>
      <div style={{ color: '#fff', fontSize: 16, fontWeight: 800 }}>Aponte para o QR da etiqueta</div>
      {!semCamera ? (
        <div style={{ position: 'relative', width: '100%', maxWidth: 520, aspectRatio: '4 / 3', borderRadius: 14, overflow: 'hidden', background: '#000' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* faixa-guia: código de barras é largo e baixo */}
          <div style={{ position: 'absolute', left: '8%', right: '8%', top: '18%', height: '64%', border: `2px solid ${LARANJA}`, borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,.35)' }} />
        </div>
      ) : (
        <div style={{ color: '#D1D5DB', fontSize: 13.5, textAlign: 'center', maxWidth: 420 }}>
          Câmera indisponível. Digite o código da etiqueta (ou use a pistola leitora).
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); abrir(digitado) }} style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 520 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Keyboard size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted)' }} />
          <input value={digitado} onChange={(e) => { setDigitado(e.target.value); setErro(null) }} autoFocus={semCamera}
            placeholder="PNI-000123 ou só 123" aria-label="Código da peça" style={{ ...INP, paddingLeft: 36 }} />
        </div>
        <button type="submit" disabled={!digitado.trim()} style={botao(LARANJA, { desab: !digitado.trim() })}>Abrir</button>
      </form>
      {erro && <div style={{ color: '#FCA5A5', fontSize: 13, fontWeight: 700 }}>{erro}</div>}
    </div>
  )
}
