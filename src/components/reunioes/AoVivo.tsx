'use client'
// Reunião AO VIVO (José, 17/11/2026).
// • O PC da sala transmite pela câmera e microfone. Quem está fora (até 2–3 pessoas) ENTRA com câmera e
//   microfone (ou só assiste) e manda pergunta por escrito. Só entra quem tem login e pode ver a reunião:
//   o PC da sala confere o "ingresso" assinado pelo servidor antes de ligar.
// • Todo mundo vê QUEM está na transmissão (nomes vêm do ingresso conferido).
// • A GRAVAÇÃO é do PC da sala e junta tudo num vídeo só: a sala em tela cheia + quem entrou em
//   quadradinhos com o nome, e o som de todos misturado. Sobe em partes de 5 min para o bucket privado
//   `reunioes-gravacoes` do Supabase (o robô apaga depois de 60 dias). Cada parte pode ser baixada.
// Ligação direta navegador↔navegador (WebRTC); o "aperto de mão" passa pelo canal em tempo real do Supabase.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Radio, Eye, Send, Circle, PlayCircle, Loader2, Download, Mic, Users, Trash2, Maximize, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { chamar } from './comum'
import PlayerGravacao from './PlayerGravacao'

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
const MAX_REMOTOS = 3                 // José: "no máximo 2 online"; 1 de folga
const PARTE_MS = 5 * 60_000           // partes de 5 min (~25 MB, abaixo do limite de 50 MB do Storage)
type Sinal = { to: string; from: string; tipo: 'offer' | 'answer' | 'ice' | 'lotado' | 'recusado'; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
export interface Pergunta { nome: string; texto: string; em: string }
export interface Gravacao { key: string; inicio: string; fim: string; bytes: number; parte: number }
interface Remoto { sid: string; nome: string; stream: MediaStream | null }
interface GrupoGravacao { titulo: string; quando: string; duracao: string; partes: Gravacao[] }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const mb = (b: number) => `${Math.max(1, Math.round(b / 1048576))} MB`
const primeiro = (n: string) => (n || '—').split(' ')[0]

const CSS = `
.av *{font-weight:inherit;box-sizing:border-box}
.av-palco{position:relative;border-radius:12px;overflow:hidden;background:#0f172a}
.av-cheia{position:absolute;top:10px;right:10px;z-index:2;display:grid;place-items:center;width:42px;height:42px;border-radius:11px;border:none;cursor:pointer;color:#fefefe;background:rgba(15,23,42,.55)}
.av-palco:fullscreen{border-radius:0;display:flex;align-items:center;justify-content:center}
.av-palco:fullscreen .av-video{height:100%;aspect-ratio:auto}
.av-palco:fullscreen .av-mini > div{width:220px}
.av-video{width:100%;aspect-ratio:16/9;background:#0f172a;object-fit:contain;display:block}
.av-mini{position:absolute;right:10px;bottom:10px;display:flex;gap:8px}
.av-mini > div{position:relative;width:150px;aspect-ratio:16/9;border-radius:9px;overflow:hidden;background:#1e293b;border:2px solid rgba(255,255,255,.35)}
.av-mini video{width:100%;height:100%;object-fit:cover;display:block}
.av-mini span{position:absolute;left:6px;bottom:4px;font-size:11.5px;color:#fefefe;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.av-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 16px;border-radius:11px;font-size:14px;font-weight:500;cursor:pointer;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);white-space:nowrap;font-family:inherit}
.av-btn.cheio{border:none;color:#fefefe;background:var(--c);box-shadow:0 6px 14px -8px var(--c)}
.av-btn.peq{height:36px;padding:0 12px;font-size:13px}
.av-btn:disabled{opacity:.5;cursor:default}
.av-rec{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12.5px;color:#dc2626;background:rgba(220,38,38,.1)}
.av-rec svg{animation:av-pisca 1.2s infinite}
@keyframes av-pisca{50%{opacity:.25}}
.av-quem{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;color:var(--portal-text-secondary,#475569)}
.av-quem span.p{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:color-mix(in srgb,#0891b2 10%,transparent);color:#0e7490}
.av-perg{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto}
.av-perg div{padding:8px 10px;border-radius:10px;background:var(--portal-bg-secondary,#f8fafc);font-size:13.5px}
.av-perg small{display:block;font-size:12px;color:var(--portal-text-muted,#64748b)}
.av-campo{flex:1;height:42px;padding:0 12px;border-radius:10px;border:1px solid var(--portal-border,#e5e7eb);background:var(--portal-bg,#fefefe);color:var(--portal-text,#111111);font-size:14px;font-family:inherit;outline:none;min-width:0}
@media (max-width:640px){.av-mini > div{width:96px}}
`

/** Vídeo que segue um MediaStream (o React não liga srcObject sozinho). */
function VideoDe({ stream, mudo, className }: { stream: MediaStream | null; mudo?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) { ref.current.srcObject = stream; void ref.current.play().catch(() => {}) } }, [stream])
  return <video ref={ref} className={className} playsInline autoPlay muted={mudo} />
}

export default function AoVivo({ reuniaoId, podeTransmitir, podeApagar = false, meuNome, perguntasIniciais, gravacoes, encerrada, onGravou }: {
  reuniaoId: string
  /** só Dev apaga gravação (o servidor confere) */
  podeApagar?: boolean
  podeTransmitir: boolean
  meuNome: string
  perguntasIniciais: Pergunta[]
  gravacoes: Gravacao[]
  encerrada: boolean
  onGravou: () => void
}) {
  const [sid] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36))
  const [papel, setPapel] = useState<'nada' | 'transmitindo' | 'assistindo'>('nada')
  const [noAr, setNoAr] = useState<{ sid: string; nome: string; gravando: boolean; quem: string[]; visto: number } | null>(null)
  const [remotos, setRemotos] = useState<Remoto[]>([])          // PC da sala: quem entrou
  const [salaStream, setSalaStream] = useState<MediaStream | null>(null)
  const [meuStream, setMeuStream] = useState<MediaStream | null>(null)
  const [conectado, setConectado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [gravar, setGravar] = useState(true)
  const [gravando, setGravando] = useState(false)
  const [enviando, setEnviando] = useState(0)
  const [perguntas, setPerguntas] = useState<Pergunta[]>(perguntasIniciais)
  const [texto, setTexto] = useState('')
  const [tocando, setTocando] = useState<{ key: string } | null>(null)   // key da 1ª parte da gravação em tela
  const [verGravacoes, setVerGravacoes] = useState(false)   // começa fechada (José, 17/11/2026)
  const [agora, setAgora] = useState(() => Date.now())
  // microfone/câmera escolhidos (lembrados neste PC) + medidor (17/11: gravação saiu muda — microfone errado)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [micId, setMicId] = useState('')
  const [camId, setCamId] = useState('')
  const [nivel, setNivel] = useState(0)
  const [mudo, setMudo] = useState(false)
  const medidor = useRef<number | null>(null)

  const papelRef = useRef(papel)
  useEffect(() => { papelRef.current = papel }, [papel])
  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const local = useRef<MediaStream | null>(null)                // câmera+mic deste navegador
  const peers = useRef(new Map<string, RTCPeerConnection>())    // PC da sala: uma conexão por quem entra
  const nomes = useRef(new Map<string, string>())
  const pcViewer = useRef<RTCPeerConnection | null>(null)
  const filaIce = useRef<RTCIceCandidateInit[]>([])
  const ingresso = useRef('')
  // gravação composta (só no PC da sala)
  const mix = useRef<{ ctx: AudioContext | null; dest: MediaStreamAudioDestinationNode | null; canvas: HTMLCanvasElement | null; desenho: number | null; videos: Map<string, HTMLVideoElement>; sala: HTMLVideoElement | null }>({ ctx: null, dest: null, canvas: null, desenho: null, videos: new Map(), sala: null })
  const rec = useRef<{ mr: MediaRecorder | null; n: number; timer: number | null }>({ mr: null, n: 0, timer: null })
  const gravandoRef = useRef(false)
  const heartbeat = useRef<number | null>(null)

  const enviar = useCallback((event: string, payload: Record<string, unknown>) => { canal.current?.send({ type: 'broadcast', event, payload }) }, [])
  const quemEsta = useCallback(() => [...nomes.current.values()], [])

  // ------------------------------------------------------------ gravação (PC da sala)
  const subirParte = useCallback(async (blob: Blob, parte: number, inicio: string, fim: string) => {
    setEnviando((n) => n + 1)
    try {
      const { bucket, key, token } = await chamar<{ bucket: string; key: string; token: string }>(`/api/reunioes/${reuniaoId}/gravacao`, { json: { acao: 'url_envio', inicio, parte } })
      const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(key, token, blob, { contentType: 'video/webm', upsert: true })
      if (error) throw new Error(error.message)
      await chamar(`/api/reunioes/${reuniaoId}/gravacao`, { json: { acao: 'registrar', key, inicio, fim, bytes: blob.size, parte } })
      onGravou()
    } catch (e) { setAviso(`A parte ${parte} da gravação não subiu: ${(e as Error).message}`) }
    finally { setEnviando((n) => n - 1) }
  }, [reuniaoId, onGravou])

  /** Liga a mesa de mixagem: canvas (sala + quadradinhos) e áudio de todos num só destino. */
  const montarMix = useCallback((s: MediaStream, ctx: AudioContext) => {
    const m = mix.current
    void ctx.resume().catch(() => {}); const dest = ctx.createMediaStreamDestination()
    ligados.current.clear()
    if (s.getAudioTracks().length) ctx.createMediaStreamSource(s).connect(dest)
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
    const sala = document.createElement('video'); sala.muted = true; sala.playsInline = true; sala.srcObject = s; void sala.play().catch(() => {})
    const g = canvas.getContext('2d')!
    // setInterval (não requestAnimationFrame): continua desenhando com a aba em segundo plano
    const desenho = window.setInterval(() => {
      g.fillStyle = '#0f172a'; g.fillRect(0, 0, 1280, 720)
      if (sala.videoWidth) { const k = Math.min(1280 / sala.videoWidth, 720 / sala.videoHeight); const w = sala.videoWidth * k, h = sala.videoHeight * k; g.drawImage(sala, (1280 - w) / 2, (720 - h) / 2, w, h) }
      let x = 1280 - 20 - 300
      for (const [id, v] of m.videos) {
        g.fillStyle = '#1e293b'; g.fillRect(x, 720 - 20 - 169, 300, 169)
        if (v.videoWidth) g.drawImage(v, x, 720 - 20 - 169, 300, 169)
        g.font = '20px sans-serif'; g.fillStyle = '#fefefe'; g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 4
        g.fillText(primeiro(nomes.current.get(id) || ''), x + 10, 720 - 30); g.shadowBlur = 0
        x -= 316
      }
    }, 66)
    Object.assign(m, { ctx, dest, canvas, desenho, sala })
  }, [])
  // ontrack chega 1× por faixa (áudio e vídeo): liga cada uma só uma vez, senão o som dobra
  const ligados = useRef(new Set<string>())
  const ligarRemotoNoMix = useCallback((id: string, stream: MediaStream) => {
    const m = mix.current
    const a = stream.getAudioTracks()[0]
    if (a && m.ctx && m.dest && !ligados.current.has(a.id)) { ligados.current.add(a.id); m.ctx.createMediaStreamSource(new MediaStream([a])).connect(m.dest) }
    const v0 = stream.getVideoTracks()[0]
    if (v0 && !ligados.current.has(v0.id)) { ligados.current.add(v0.id); const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([v0]); void v.play().catch(() => {}); m.videos.set(id, v) }
  }, [])
  const desmontarMix = useCallback(() => {
    const m = mix.current
    if (m.desenho) window.clearInterval(m.desenho)
    void m.ctx?.close().catch(() => {})
    mix.current = { ctx: null, dest: null, canvas: null, desenho: null, videos: new Map(), sala: null }
  }, [])

  const novaParte = useCallback(() => {
    const m = mix.current
    if (!m.canvas || !m.dest || !gravandoRef.current) return
    const fluxo = new MediaStream([...m.canvas.captureStream(15).getVideoTracks(), ...m.dest.stream.getAudioTracks()])
    const tipos = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
    const mimeType = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || ''
    const mr = new MediaRecorder(fluxo, { mimeType, videoBitsPerSecond: 600_000, audioBitsPerSecond: 64_000 })
    const g = rec.current; const n = ++g.n; const inicio = new Date().toISOString(); const pedacos: Blob[] = []
    mr.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data) }
    mr.onstop = () => {
      if (pedacos.length) void subirParte(new Blob(pedacos, { type: 'video/webm' }), n, inicio, new Date().toISOString())
      if (gravandoRef.current) novaParte()
    }
    mr.start(5000); g.mr = mr
    if (g.timer) window.clearTimeout(g.timer)
    g.timer = window.setTimeout(() => { if (mr.state !== 'inactive') mr.stop() }, PARTE_MS)
  }, [subirParte])

  const pararGravacao = useCallback(() => {
    gravandoRef.current = false; setGravando(false)
    const g = rec.current
    if (g.timer) window.clearTimeout(g.timer)
    if (g.mr && g.mr.state !== 'inactive') g.mr.stop()
    g.mr = null
  }, [])

  // ------------------------------------------------------------ PC da sala: aceitar quem entra
  const tirarRemoto = useCallback((id: string) => {
    peers.current.get(id)?.close(); peers.current.delete(id); nomes.current.delete(id); mix.current.videos.delete(id)
    setRemotos((l) => l.filter((x) => x.sid !== id))
  }, [])
  const aceitar = useCallback(async (viewer: string, ing: string) => {
    if (!local.current) return
    let nome = ''
    try { nome = (await chamar<{ nome: string }>(`/api/reunioes/${reuniaoId}/gravacao`, { json: { acao: 'conferir', ingresso: ing } })).nome }
    catch { enviar('sinal', { to: viewer, from: sid, tipo: 'recusado' }); return }
    if (peers.current.has(viewer)) tirarRemoto(viewer)
    if (peers.current.size >= MAX_REMOTOS) { enviar('sinal', { to: viewer, from: sid, tipo: 'lotado' }); return }
    const pc = new RTCPeerConnection({ iceServers: ICE })
    peers.current.set(viewer, pc); nomes.current.set(viewer, nome)
    setRemotos((l) => [...l.filter((x) => x.sid !== viewer), { sid: viewer, nome, stream: null }])
    local.current.getTracks().forEach((t) => pc.addTrack(t, local.current!))
    pc.ontrack = (e) => {
      const st = e.streams[0]; if (!st) return
      setRemotos((l) => l.map((x) => (x.sid === viewer ? { ...x, stream: st } : x)))
      ligarRemotoNoMix(viewer, st)
    }
    pc.onicecandidate = (e) => { if (e.candidate) enviar('sinal', { to: viewer, from: sid, tipo: 'ice', candidate: e.candidate.toJSON() }) }
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) tirarRemoto(viewer) }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    enviar('sinal', { to: viewer, from: sid, tipo: 'offer', sdp: offer })
  }, [enviar, sid, reuniaoId, tirarRemoto, ligarRemotoNoMix])

  // ------------------------------------------------------------ sinais
  const aoSinal = useCallback(async (s: Sinal) => {
    if (s.to !== sid) return
    if (papelRef.current === 'transmitindo') {
      const pc = peers.current.get(s.from); if (!pc) return
      if (s.tipo === 'answer' && s.sdp) await pc.setRemoteDescription(s.sdp)
      if (s.tipo === 'ice' && s.candidate) await pc.addIceCandidate(s.candidate).catch(() => {})
      return
    }
    if (papelRef.current !== 'assistindo') return
    if (s.tipo === 'lotado') { setAviso('Já tem gente demais na transmissão. Tente de novo daqui a pouco.'); sairAssistirRef.current(); return }
    if (s.tipo === 'recusado') { setAviso('Não deu para conferir seu acesso a esta reunião. Atualize a página e tente de novo.'); sairAssistirRef.current(); return }
    if (s.tipo === 'offer' && s.sdp) {
      pcViewer.current?.close()
      const pc = new RTCPeerConnection({ iceServers: ICE }); pcViewer.current = pc
      pc.ontrack = (e) => { if (e.streams[0]) setSalaStream(e.streams[0]) }
      pc.onicecandidate = (e) => { if (e.candidate) enviar('sinal', { to: s.from, from: sid, tipo: 'ice', candidate: e.candidate.toJSON() }) }
      pc.onconnectionstatechange = () => setConectado(pc.connectionState === 'connected')
      await pc.setRemoteDescription(s.sdp)
      // quem entra com câmera/mic manda de volta (vai para a sala e para a gravação)
      local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!))
      for (const c of filaIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {})
      const ans = await pc.createAnswer(); await pc.setLocalDescription(ans)
      enviar('sinal', { to: s.from, from: sid, tipo: 'answer', sdp: ans })
    }
    if (s.tipo === 'ice' && s.candidate) {
      const pc = pcViewer.current
      if (pc?.remoteDescription) await pc.addIceCandidate(s.candidate).catch(() => {})
      else filaIce.current.push(s.candidate)
    }
  }, [enviar, sid])
  const sairAssistirRef = useRef<() => void>(() => {})

  useEffect(() => {
    const ch = supabase.channel(`reuniao-ao-vivo-${reuniaoId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'no-ar' }, ({ payload }) => setNoAr({ ...(payload as { sid: string; nome: string; gravando: boolean; quem: string[] }), visto: Date.now() }))
      .on('broadcast', { event: 'fim' }, () => { setNoAr(null); if (papelRef.current === 'assistindo') sairAssistirRef.current() })
      .on('broadcast', { event: 'entrar' }, ({ payload }) => {
        const p = payload as { sid: string; ingresso: string }
        if (papelRef.current === 'transmitindo' && p.ingresso) void aceitar(String(p.sid), String(p.ingresso))
      })
      .on('broadcast', { event: 'sinal' }, ({ payload }) => { void aoSinal(payload as Sinal) })
      .on('broadcast', { event: 'pergunta' }, ({ payload }) => setPerguntas((l) => [...l, payload as Pergunta]))
      .subscribe()
    canal.current = ch
    const t = window.setInterval(() => setAgora(Date.now()), 3000)
    return () => { window.clearInterval(t); void supabase.removeChannel(ch); canal.current = null }
  }, [reuniaoId, aceitar, aoSinal])

  // quem quer entrar e ainda não conectou pede de novo a cada "no ar"
  useEffect(() => {
    if (papel === 'assistindo' && noAr && !conectado && ingresso.current) enviar('entrar', { sid, ingresso: ingresso.current })
  }, [papel, noAr, conectado, enviar, sid])

  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (papelRef.current === 'transmitindo' || enviando > 0) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [enviando])

  const pegarCamera = async () => navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(camId ? { deviceId: { exact: camId } } : {}) },
    audio: { echoCancellation: true, noiseSuppression: true, ...(micId ? { deviceId: { exact: micId } } : {}) },
  })
  const listarDispositivos = useCallback(async () => {
    try {
      const ds = await navigator.mediaDevices.enumerateDevices()
      setMics(ds.filter((d) => d.kind === 'audioinput' && d.deviceId)); setCams(ds.filter((d) => d.kind === 'videoinput' && d.deviceId))
    } catch { /* sem permissão ainda */ }
  }, [])
  useEffect(() => {
    try { setMicId(localStorage.getItem('reuniao-mic') || ''); setCamId(localStorage.getItem('reuniao-cam') || '') } catch { /* sem storage */ }
    void listarDispositivos()
  }, [listarDispositivos])
  const permitir = async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); s.getTracks().forEach((t) => t.stop()); await listarDispositivos() } catch { setAviso('O navegador não liberou a câmera/microfone. Clique no cadeado ao lado do endereço e permita.') } }
  /** Medidor do microfone: barrinha + aviso se ficar mudo 8 s. */
  const ligarMedidor = (ctx: AudioContext, s: MediaStream) => {
    if (!s.getAudioTracks().length) { setMudo(true); return }
    const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(s).connect(an)
    const buf = new Uint8Array(an.fftSize); let quieto = 0
    medidor.current = window.setInterval(() => {
      an.getByteTimeDomainData(buf)
      let soma = 0; for (const v of buf) soma += (v - 128) * (v - 128)
      const rms = Math.sqrt(soma / buf.length) / 128
      setNivel(Math.min(1, rms * 4))
      quieto = rms < 0.004 ? quieto + 200 : 0
      setMudo(quieto >= 8000)
    }, 200)
  }

  const transmitir = async () => {
    setAviso('')
    const ctx = new AudioContext()   // criado no clique: depois do "permitir câmera" ele nasceria parado e a gravação sairia muda
    try {
      const s = await pegarCamera()
      void listarDispositivos()
      local.current = s; setMeuStream(s)
      papelRef.current = 'transmitindo'; setPapel('transmitindo')
      montarMix(s, ctx)
      ligarMedidor(ctx, s)
      if (gravar) { gravandoRef.current = true; setGravando(true); rec.current = { mr: null, n: 0, timer: null }; novaParte() }
      const bate = () => enviar('no-ar', { sid, nome: meuNome, gravando: gravandoRef.current, quem: quemEsta() })
      bate(); heartbeat.current = window.setInterval(bate, 3000)
    } catch { setAviso('Não deu para usar a câmera/microfone. Libere no navegador (cadeado ao lado do endereço) e tente de novo.') }
  }
  const pararTransmissao = () => {
    if (medidor.current) window.clearInterval(medidor.current); setNivel(0); setMudo(false)
    if (heartbeat.current) window.clearInterval(heartbeat.current)
    pararGravacao()
    enviar('fim', {})
    for (const id of [...peers.current.keys()]) tirarRemoto(id)
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null; setMeuStream(null)
    window.setTimeout(desmontarMix, 1500)   // deixa a última parte terminar de gravar
    setPapel('nada')
  }
  const assistir = async (comCamera: boolean) => {
    setAviso('')
    try { ingresso.current = (await chamar<{ ingresso: string }>(`/api/reunioes/${reuniaoId}/gravacao`, { json: { acao: 'ingresso' } })).ingresso }
    catch (e) { setAviso((e as Error).message); return }
    if (comCamera) {
      try { const s = await pegarCamera(); local.current = s; setMeuStream(s) }
      catch { setAviso('Sem câmera/microfone liberados — você entra só assistindo.') }
    }
    papelRef.current = 'assistindo'; setPapel('assistindo'); setConectado(false)
    enviar('entrar', { sid, ingresso: ingresso.current })
  }
  const sairAssistir = useCallback(() => {
    pcViewer.current?.close(); pcViewer.current = null; setConectado(false); setSalaStream(null)
    local.current?.getTracks().forEach((t) => t.stop()); local.current = null; setMeuStream(null)
    papelRef.current = 'nada'; setPapel('nada')
  }, [])
  useEffect(() => { sairAssistirRef.current = sairAssistir }, [sairAssistir])

  const perguntar = async () => {
    const t = texto.trim(); if (!t) return
    const p = { nome: meuNome, texto: t, em: new Date().toISOString() }
    setTexto(''); setPerguntas((l) => [...l, p]); enviar('pergunta', p)
    await chamar(`/api/reunioes/${reuniaoId}/gravacao`, { json: { acao: 'pergunta', texto: t } }).catch(() => setAviso('A pergunta apareceu na tela, mas não ficou salva.'))
  }
  const linkGravacao = useCallback(async (key: string, baixar: boolean) => (await chamar<{ url: string }>(`/api/reunioes/${reuniaoId}/gravacao?key=${encodeURIComponent(key)}${baixar ? '&baixar=1' : ''}`)).url, [reuniaoId])
  const linkTocar = useCallback((key: string) => linkGravacao(key, false), [linkGravacao])
  const tocar = (key: string) => setTocando({ key })
  const baixar = async (keys: string[]) => {
    for (const k of keys) {
      try {
        const a = document.createElement('a'); a.href = await linkGravacao(k, true); a.rel = 'noopener'
        document.body.appendChild(a); a.click(); a.remove()
        await new Promise((r) => setTimeout(r, 800))   // o navegador baixa um de cada vez
      } catch (e) { setAviso((e as Error).message) }
    }
  }

  const apagar = async (gr: GrupoGravacao) => {
    if (!window.confirm(`Apagar a ${gr.titulo} (${gr.quando})? Não dá para desfazer.`)) return
    try {
      for (const g of gr.partes) await chamar(`/api/reunioes/${reuniaoId}/gravacao`, { json: { acao: 'apagar', key: g.key } })
      if (tocando && gr.partes.some((g) => g.key === tocando.key)) setTocando(null)
      onGravou()
    } catch (e) { setAviso((e as Error).message) }
  }

  // Tela cheia (José, 17/11/2026: "no celular, deixar o vídeo em tela cheia").
  // Android/PC: o quadro inteiro (com os quadradinhos) e tenta virar o celular de lado.
  // iPhone: o Safari só aceita o próprio vídeo em tela cheia (webkitEnterFullscreen).
  const telaCheia = (el: HTMLElement | null) => {
    if (!el) return
    const v = (el.tagName === 'VIDEO' ? el : el.querySelector('video')) as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (el.requestFullscreen) {
      el.requestFullscreen().then(() => {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        void o?.lock?.('landscape').catch(() => {})
      }).catch(() => v?.webkitEnterFullscreen?.())
    } else v?.webkitEnterFullscreen?.()
  }

  const alguemNoAr = !!noAr && agora - noAr.visto < 10_000 && papel !== 'transmitindo'
  const recentes = gravacoes.filter((g) => agora - new Date(g.inicio).getTime() < 60 * 86400_000)
  // Cada transmissão = UMA gravação (a parte 1 abre uma nova) — José, 17/11/2026: "melhora os nomes, está confuso"
  const grupos: GrupoGravacao[] = []
  for (const g of [...recentes].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const ult = grupos[grupos.length - 1]
    if (!ult || g.parte === 1 || g.parte <= ult.partes[ult.partes.length - 1].parte) grupos.push({ titulo: '', quando: '', duracao: '', partes: [g] })
    else ult.partes.push(g)
  }
  grupos.forEach((gr, i) => {
    const ini = gr.partes[0].inicio; const fim = gr.partes[gr.partes.length - 1].fim
    const seg = Math.max(1, Math.round((new Date(fim).getTime() - new Date(ini).getTime()) / 1000))
    const dia = new Date(ini).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
    gr.titulo = `Gravação ${i + 1}`
    gr.quando = hora(ini) === hora(fim) ? `${dia}, às ${hora(ini)}` : `${dia}, das ${hora(ini)} às ${hora(fim)}`
    gr.duracao = seg < 60 ? `${seg} s` : seg < 3600 ? `${Math.round(seg / 60)} min` : `${Math.floor(seg / 3600)} h ${Math.round((seg % 3600) / 60)} min`
  })
  grupos.reverse()   // a mais nova em cima
  const naTransmissao = papel === 'transmitindo' ? remotos.map((r) => r.nome) : (noAr?.quem || [])

  return (
    <div className="av" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{CSS}</style>

      {papel === 'transmitindo' && (
        <div className="av-palco">
          <button className="av-cheia" title="Tela cheia" aria-label="Tela cheia" onClick={(e) => telaCheia(e.currentTarget.parentElement)}><Maximize size={18} /></button>
          <VideoDe stream={meuStream} mudo className="av-video" />
          {remotos.length > 0 && (
            <div className="av-mini">
              {remotos.map((r) => <div key={r.sid}><VideoDe stream={r.stream} className="" /><span>{primeiro(r.nome)}</span></div>)}
            </div>
          )}
        </div>
      )}
      {papel === 'assistindo' && (
        <div className="av-palco">
          <button className="av-cheia" title="Tela cheia" aria-label="Tela cheia" onClick={(e) => telaCheia(e.currentTarget.parentElement)}><Maximize size={18} /></button>
          <VideoDe stream={salaStream} className="av-video" />
          {meuStream && <div className="av-mini"><div><VideoDe stream={meuStream} mudo /><span>Você</span></div></div>}
        </div>
      )}

      {/* quem está na transmissão — todos veem */}
      {(papel !== 'nada' || alguemNoAr) && (
        <div className="av-quem">
          <Users size={14} /> {papel === 'transmitindo' ? 'Entraram:' : `${primeiro(noAr?.nome || '')} transmite da sala ·`}
          {naTransmissao.length === 0 ? <span>ninguém ainda</span> : naTransmissao.map((n, i) => <span key={i} className="p">{n}</span>)}
        </div>
      )}

      {papel === 'transmitindo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)' }}>
          <span className="av-rec"><Radio size={13} /> No ar</span>
          <span title="Som do microfone" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Mic size={14} color={mudo ? '#dc2626' : '#059669'} />
            <span style={{ width: 70, height: 8, borderRadius: 4, background: 'var(--portal-border,#e2e8f0)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.round(nivel * 100)}%`, background: '#059669', transition: 'width .15s' }} /></span>
          </span>
          {gravando && <span className="av-rec"><Circle size={10} fill="#dc2626" /> Gravando a sala e quem entrou</span>}
          {enviando > 0 && <span><Loader2 size={14} className="fa-spin" style={{ verticalAlign: -2 }} /> subindo gravação…</span>}
          <span style={{ flex: 1 }} />
          <button className="av-btn cheio" style={{ ['--c' as string]: '#0f172a' }} onClick={pararTransmissao}><VideoOff size={15} /> Parar transmissão</button>
        </div>
      )}
      {papel === 'assistindo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)' }}>
          {conectado ? <span className="av-rec"><Radio size={13} /> Ao vivo</span> : <span><Loader2 size={14} className="fa-spin" style={{ verticalAlign: -2 }} /> Conectando…</span>}
          {noAr?.gravando && <span className="av-rec"><Circle size={10} fill="#dc2626" /> Esta reunião está sendo gravada{meuStream ? ', inclusive você' : ''}</span>}
          <span style={{ flex: 1 }} />
          <button className="av-btn" onClick={sairAssistir}>Sair</button>
        </div>
      )}

      {/* Organizado (José, 17/11/2026: "desorganizado"): 1) situação  2) entrar  ou  quadro "Transmitir desta sala" */}
      {papel === 'nada' && !encerrada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
          {alguemNoAr
            ? <span className="av-rec"><Radio size={13} /> Ao vivo · {primeiro(noAr!.nome)} está transmitindo da sala</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--portal-text-muted,#64748b)' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#cbd5e1' }} /> Ninguém transmitindo agora</span>}
        </div>
      )}
      {papel === 'nada' && !encerrada && alguemNoAr && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="av-btn cheio" style={{ ['--c' as string]: '#dc2626' }} onClick={() => void assistir(true)}><Mic size={15} /> Entrar com câmera e microfone</button>
            <button className="av-btn" onClick={() => void assistir(false)}><Eye size={15} /> Só assistir</button>
          </div>
          {noAr?.gravando && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>Esta reunião está sendo gravada. Quem entra com câmera e microfone aparece na gravação.</span>}
        </div>
      )}
      {papel === 'nada' && !encerrada && podeTransmitir && !alguemNoAr && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, borderRadius: 14, border: '1px solid var(--portal-border,#e2e8f0)', background: 'var(--portal-bg-secondary,#f8fafc)' }}>
          <span style={{ fontSize: 14.5, fontWeight: 500 }}>Transmitir desta sala</span>
          {mics.length === 0 && cams.length === 0
            ? <button className="av-btn" style={{ alignSelf: 'flex-start' }} onClick={() => void permitir()}><Mic size={15} /> Escolher microfone e câmera</button>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mic size={13} /> Microfone</span>
                  <select className="av-campo" style={{ flex: 'none', width: '100%' }} value={micId} onChange={(e) => { setMicId(e.target.value); try { localStorage.setItem('reuniao-mic', e.target.value) } catch { /* */ } }}>
                    <option value="">O que o computador usa normalmente</option>
                    {mics.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microfone'}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Video size={13} /> Câmera</span>
                  <select className="av-campo" style={{ flex: 'none', width: '100%' }} value={camId} onChange={(e) => { setCamId(e.target.value); try { localStorage.setItem('reuniao-cam', e.target.value) } catch { /* */ } }}>
                    <option value="">A que o computador usa normalmente</option>
                    {cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Câmera'}</option>)}
                  </select>
                </label>
              </div>
            )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', flex: '1 1 240px', fontSize: 13.5, color: 'var(--portal-text,#0f172a)' }}>
              <input type="checkbox" checked={gravar} onChange={(e) => setGravar(e.target.checked)} style={{ marginTop: 3 }} />
              <span>Gravar esta reunião<span style={{ display: 'block', fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>Grava a sala e quem entrar. Fica 60 dias e pode ser baixada.</span></span>
            </label>
            <button className="av-btn cheio" style={{ ['--c' as string]: '#dc2626' }} onClick={() => void transmitir()}><Video size={15} /> Transmitir desta sala</button>
          </div>
        </div>
      )}
      {papel === 'transmitindo' && mudo && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#b91c1c', fontSize: 13.5 }}>
          O microfone não está captando som — a gravação vai sair muda. Pare a transmissão, escolha outro microfone no quadro &quot;Transmitir desta sala&quot; e transmita de novo. Confira também se ele não está mudo no Windows (Configurações → Som → Entrada).
        </div>
      )}

      {aviso && <div style={{ fontSize: 13, color: '#b45309' }}>{aviso}</div>}

      {(papel !== 'nada' || perguntas.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Perguntas de quem está de fora</span>
          {perguntas.length === 0 && <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Nenhuma ainda.</span>}
          <div className="av-perg">
            {perguntas.map((p, i) => <div key={i}><small>{primeiro(p.nome)} · {hora(p.em)}</small>{p.texto}</div>)}
          </div>
          {papel === 'assistindo' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="av-campo" value={texto} maxLength={1000} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void perguntar() }} placeholder="Escreva sua pergunta para a sala" />
              <button className="av-btn cheio" style={{ ['--c' as string]: '#2563eb' }} disabled={!texto.trim()} onClick={() => void perguntar()}><Send size={15} /> Enviar</button>
            </div>
          )}
        </div>
      )}

      {recentes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => { setVerGravacoes(!verGravacoes); if (verGravacoes) setTocando(null) }} aria-expanded={verGravacoes}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--portal-border,#e2e8f0)', background: 'var(--portal-surface,#fefefe)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--portal-text,#0f172a)', textAlign: 'left' }}>
            <ChevronRight size={16} style={{ transform: verGravacoes ? 'rotate(90deg)' : 'none', transition: 'transform .2s', color: 'var(--portal-text-muted,#64748b)' }} />
            <span style={{ fontSize: 14.5, fontWeight: 500 }}>Gravações</span>
            <span style={{ fontSize: 12, padding: '1px 8px', borderRadius: 999, background: 'var(--portal-bg-secondary,#f1f5f9)', color: 'var(--portal-text-muted,#64748b)' }}>{grupos.length}</span>
            <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>· ficam 60 dias</span>
          </button>
          {verGravacoes && <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {grupos.map((gr) => {
              const tocandoAqui = !!tocando && gr.partes.some((g) => g.key === tocando.key)
              return (
                <div key={gr.partes[0].key} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 12, border: `1px solid ${tocandoAqui ? '#2563eb' : 'var(--portal-border,#e2e8f0)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', flex: '1 1 200px', minWidth: 0 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 500 }}>{gr.titulo}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>{gr.quando} · {gr.duracao} · {mb(gr.partes.reduce((t, g) => t + g.bytes, 0))}</span>
                    </span>
                    <button className="av-btn peq cheio" style={{ ['--c' as string]: '#2563eb' }} onClick={() => tocar(gr.partes[0].key)}><PlayCircle size={15} /> Assistir</button>
                    <button className="av-btn peq" onClick={() => void baixar(gr.partes.map((g) => g.key))}><Download size={14} /> Baixar</button>
                    {podeApagar && <button className="av-btn peq" title="Apagar esta gravação (só Dev)" style={{ color: '#dc2626' }} onClick={() => void apagar(gr)}><Trash2 size={14} /> Apagar</button>}
                  </div>
                </div>
              )
            })}
          </div>
          {tocando && (() => {
            const gr = grupos.find((x) => x.partes[0].key === tocando.key)
            return gr ? <PlayerGravacao key={tocando.key} partes={gr.partes} linkDe={linkTocar} /> : null
          })()}
          </>}
        </div>
      )}
    </div>
  )
}
