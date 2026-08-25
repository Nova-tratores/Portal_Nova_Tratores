'use client'
// Leitor de QR pela CÂMERA (overlay fullscreen), reutilizável — usa o
// @zxing/browser que o portal já tem (import dinâmico, mesmo padrão do leitor
// de DANFE em lib/financeiro/leitor-anexos.js). Estrutura de câmera copiada do
// checklist-veiculo do app dos mecânicos (getUserMedia environment).
//
// O pai valida cada leitura (chama a API) e devolve um ScanResultado — o
// componente só cuida de câmera, parse, dedupe e feedback (flash/beep/vibra).
// Sem câmera/permissão negada: input manual (UN-000123 ou colar o link) no
// próprio overlay — também é o caminho do desktop sem webcam.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Camera, Keyboard, X } from 'lucide-react'
import { extrairUnidadeId } from '@/lib/pecas/qr'

export { extrairUnidadeId }

export type ScanResultado =
  | { ok: true; mensagem?: string }
  | { ok: false; mensagem: string }
  | { ok: 'repetida'; mensagem?: string }
  | { ok: 'pausar'; mensagem?: string } // válido, mas o pai quer decidir (bottom sheet) — retome com resume()

export interface QRScannerHandle {
  resume(): void
}

interface QRScannerProps {
  open: boolean
  onClose: () => void
  /** uuid extraído do QR; o pai valida e devolve o resultado do feedback */
  onScan: (unidadeId: string) => Promise<ScanResultado>
  /** 'single' fecha sozinho após 1 ok:true; 'continuous' segue lendo (default) */
  modo?: 'single' | 'continuous'
  titulo?: string
  /** linha de contexto sob o título — pode mudar entre leituras */
  subtitulo?: string
  /** fallback manual (UN-000123 / uuid / link). Sem ele, o input manual some. */
  onDigitar?: (texto: string) => Promise<ScanResultado>
}

type Flash = 'ok' | 'erro' | 'rep' | null

const QRScanner = forwardRef<QRScannerHandle, QRScannerProps>(function QRScanner(
  { open, onClose, onScan, modo = 'continuous', titulo = 'Escaneie o QR da peça', subtitulo, onDigitar },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop(): void } | null>(null)
  const ultimaRef = useRef<{ texto: string; em: number }>({ texto: '', em: 0 })
  const processandoRef = useRef(false)
  const pausadoRef = useRef(false)
  const audioRef = useRef<AudioContext | null>(null)

  const [flash, setFlash] = useState<Flash>(null)
  const [mensagem, setMensagem] = useState('')
  const [lidas, setLidas] = useState(0)
  const [semCamera, setSemCamera] = useState(false)
  const [manual, setManual] = useState('')
  const [manualAberto, setManualAberto] = useState(false)
  const [enviandoManual, setEnviandoManual] = useState(false)

  useImperativeHandle(ref, () => ({ resume: () => { pausadoRef.current = false } }), [])

  // iOS: AudioContext só sai do 'suspended' se criado/resumido DENTRO de um
  // gesto — o callback do zxing não é gesto. Qualquer toque no overlay
  // (Cancelar, digitar, ou a própria tela) destrava o áudio.
  const destravarAudio = useCallback(() => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext()
      if (audioRef.current.state === 'suspended') void audioRef.current.resume()
    } catch { /* sem som, segue */ }
  }, [])

  const beep = useCallback((freq: number) => {
    try {
      if (!audioRef.current) audioRef.current = new AudioContext()
      const ctx = audioRef.current
      if (ctx.state === 'suspended') void ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.value = 0.08
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } catch { /* sem som, segue */ }
  }, [])

  // fecha o contexto no unmount (iOS limita ~4 AudioContexts simultâneos)
  useEffect(() => () => {
    try { void audioRef.current?.close() } catch { /* segue */ }
    audioRef.current = null
  }, [])

  const feedback = useCallback((r: ScanResultado) => {
    if (r.ok === true) {
      setFlash('ok')
      setMensagem(r.mensagem || 'OK')
      beep(880)
      try { navigator.vibrate?.(80) } catch { /* segue */ }
      setLidas(n => n + 1)
    } else if (r.ok === 'repetida') {
      setFlash('rep')
      setMensagem(r.mensagem || 'Já escaneada')
    } else if (r.ok === 'pausar') {
      pausadoRef.current = true
      if (r.mensagem) setMensagem(r.mensagem)
    } else {
      setFlash('erro')
      setMensagem(r.mensagem)
      beep(220)
      try { navigator.vibrate?.([60, 40, 60]) } catch { /* segue */ }
    }
    setTimeout(() => setFlash(null), 350)
  }, [beep])

  const tratarLeitura = useCallback(async (texto: string) => {
    if (pausadoRef.current || processandoRef.current) return
    const agora = Date.now()
    // o zxing dispara ~10 leituras/s com o QR parado — ignora a MESMA string
    // por 2,5s (mudar de etiqueta reseta na hora)
    if (texto === ultimaRef.current.texto && agora - ultimaRef.current.em < 2500) return
    ultimaRef.current = { texto, em: agora }

    const uuid = extrairUnidadeId(texto)
    if (!uuid) {
      feedback({ ok: false, mensagem: 'QR não é de uma peça rastreada.' })
      return
    }
    processandoRef.current = true
    try {
      const r = await onScan(uuid)
      feedback(r)
      if (r.ok === true && modo === 'single') onClose()
    } catch (e) {
      feedback({ ok: false, mensagem: String(e instanceof Error ? e.message : e) })
    } finally {
      processandoRef.current = false
    }
  }, [onScan, modo, onClose, feedback])

  // O callback do zxing lê a versão MAIS RECENTE via ref — os pais passam
  // onScan/onClose inline (identidade nova a cada render), e se o efeito da
  // câmera dependesse deles, CADA setState do pai reiniciaria o getUserMedia
  // (preview preto, contador zerado, pausadoRef resetado com o bottom sheet
  // aberto → loop de releitura do mesmo QR).
  const tratarLeituraRef = useRef(tratarLeitura)
  tratarLeituraRef.current = tratarLeitura

  // sessão de câmera: se o overlay fechou/reabriu enquanto o getUserMedia
  // ainda resolvia, a sessão antiga se auto-encerra (senão o LED da câmera
  // ficava aceso com o scanner fechado — stream órfão)
  const sessaoRef = useRef(0)

  const pararCamera = useCallback(() => {
    sessaoRef.current += 1 // invalida qualquer início ainda em voo
    try { controlsRef.current?.stop() } catch { /* segue */ }
    controlsRef.current = null
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null
      stream?.getTracks().forEach(t => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    } catch { /* segue */ }
  }, [])

  const iniciarCamera = useCallback(async () => {
    const sessao = ++sessaoRef.current
    setSemCamera(false)
    setMensagem('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem câmera')
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const reader = new BrowserQRCodeReader()
      // decodeFromConstraints já chama getUserMedia internamente
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
        videoRef.current!,
        (result) => { if (result) void tratarLeituraRef.current(result.getText()) },
      )
      if (sessao !== sessaoRef.current) {
        // overlay já fechou (ou reabriu) enquanto a câmera abria — encerra
        try { controls.stop() } catch { /* segue */ }
        try {
          const stream = videoRef.current?.srcObject as MediaStream | null
          stream?.getTracks().forEach(t => t.stop())
        } catch { /* segue */ }
        return
      }
      controlsRef.current = controls
    } catch {
      if (sessao === sessaoRef.current) {
        setSemCamera(true)
        setManualAberto(true)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    pausadoRef.current = false
    ultimaRef.current = { texto: '', em: 0 }
    setLidas(0)
    setMensagem('')
    setManual('')
    setManualAberto(false)
    void iniciarCamera()
    return pararCamera
    // iniciarCamera/pararCamera são estáveis (leem callbacks via ref) — o
    // efeito roda SÓ na abertura/fechamento, nunca em re-render do pai
  }, [open, iniciarCamera, pararCamera])

  const enviarManual = async () => {
    const texto = manual.trim()
    if (!texto || enviandoManual) return
    setEnviandoManual(true)
    try {
      const uuid = extrairUnidadeId(texto)
      if (uuid) {
        const r = await onScan(uuid)
        feedback(r)
        if (r.ok === true) setManual('')
        if (r.ok === true && modo === 'single') onClose()
      } else if (onDigitar) {
        const r = await onDigitar(texto)
        feedback(r)
        if (r.ok === true) setManual('')
        if (r.ok === true && modo === 'single') onClose()
      } else {
        feedback({ ok: false, mensagem: 'Digite o UN-000123 da etiqueta ou cole o link do QR.' })
      }
    } finally {
      setEnviandoManual(false)
    }
  }

  if (!open) return null

  return (
    <div onPointerDown={destravarAudio} style={{ position: 'fixed', inset: 0, zIndex: 70000, background: '#000', display: 'flex', flexDirection: 'column' }}>
      {/* câmera */}
      {!semCamera && (
        <video ref={videoRef} playsInline muted autoPlay
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}

      {/* flash de feedback */}
      {flash && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: flash === 'ok' ? 'rgba(22,163,74,.45)' : flash === 'erro' ? 'rgba(220,38,38,.45)' : 'rgba(245,158,11,.35)',
          transition: 'opacity .3s',
        }} />
      )}

      {/* retículo (4 cantos) */}
      {!semCamera && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(62vw, 300px)', aspectRatio: '1', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: 34, height: 34, borderTop: '4px solid #fff', borderLeft: '4px solid #fff', borderRadius: 2, opacity: .9 }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 34, height: 34, borderTop: '4px solid #fff', borderRight: '4px solid #fff', borderRadius: 2, opacity: .9 }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 34, height: 34, borderBottom: '4px solid #fff', borderLeft: '4px solid #fff', borderRadius: 2, opacity: .9 }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 34, height: 34, borderBottom: '4px solid #fff', borderRight: '4px solid #fff', borderRadius: 2, opacity: .9 }} />
        </div>
      )}

      {/* topo */}
      <div style={{ position: 'relative', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 800, textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{titulo}</div>
          {subtitulo && <div style={{ color: '#e5e7eb', fontSize: 13, marginTop: 2, textShadow: '0 1px 4px rgba(0,0,0,.8)' }}>{subtitulo}</div>}
        </div>
        {modo === 'continuous' && lidas > 0 && (
          <span style={{ background: '#16a34a', color: '#fff', fontSize: 12.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>{lidas} lida{lidas === 1 ? '' : 's'}</span>
        )}
        <button onClick={onClose} aria-label="Fechar" style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.18)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* sem câmera: aviso central */}
      {semCamera && (
        <div style={{ position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: '#e5e7eb', padding: '0 24px', width: '100%', boxSizing: 'border-box' }}>
          <Camera size={38} style={{ opacity: .6 }} />
          <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 10 }}>Câmera indisponível</div>
          <div style={{ fontSize: 12.5, marginTop: 4, opacity: .85 }}>Digite o número da etiqueta abaixo (UN-000123) ou cole o link do QR.</div>
          <button onClick={() => void iniciarCamera()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.4)', background: 'transparent', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Tentar câmera de novo
          </button>
        </div>
      )}

      {/* rodapé */}
      <div style={{ position: 'relative', background: 'rgba(0,0,0,.85)', padding: '12px 16px calc(12px + env(safe-area-inset-bottom))' }}>
        {mensagem && (
          <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 700, marginBottom: 10, textAlign: 'center', wordBreak: 'break-word' }}>{mensagem}</div>
        )}
        {(manualAberto || semCamera) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              value={manual}
              onChange={e => setManual(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void enviarManual() }}
              placeholder="UN-000123 ou link do QR"
              autoFocus
              style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1px solid #4b5563', background: '#111827', color: '#fff', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
            />
            <button onClick={() => void enviarManual()} disabled={enviandoManual || !manual.trim()} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: enviandoManual || !manual.trim() ? '#4b5563' : '#2563eb', color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>
              {enviandoManual ? '…' : 'OK'}
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.35)', background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Concluir
          </button>
          {!semCamera && (
            <button onClick={() => setManualAberto(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '11px 14px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              <Keyboard size={15} /> digitar código
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

export default QRScanner
