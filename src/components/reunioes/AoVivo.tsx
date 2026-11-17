'use client'
// Reunião AO VIVO (José, 17/11/2026): o PC da sala transmite pela câmera e microfone; quem está fora
// (até 2 pessoas) assiste e manda pergunta por escrito. O PC da sala também GRAVA e sobe, em partes de
// 5 min, para o bucket privado `reunioes-gravacoes` do Supabase (o robô apaga depois de 60 dias).
// Ligação direta navegador↔navegador (WebRTC); o "aperto de mão" passa pelo canal em tempo real do
// Supabase (broadcast, sem tabela).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Video, VideoOff, Radio, Eye, Send, Circle, PlayCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { chamar } from './comum'

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
const MAX_ASSISTINDO = 3              // José: "no máximo 2 online"; 1 de folga
const PARTE_MS = 5 * 60_000           // partes de 5 min (~25 MB, abaixo do limite de 50 MB do Storage)
type Sinal = { to: string; from: string; tipo: 'offer' | 'answer' | 'ice' | 'lotado'; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
export interface Pergunta { nome: string; texto: string; em: string }
export interface Gravacao { key: string; inicio: string; fim: string; bytes: number; parte: number }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const mb = (b: number) => `${(b / 1048576).toFixed(0)} MB`

const CSS = `
.av *{font-weight:inherit;box-sizing:border-box}
.av-video{width:100%;aspect-ratio:16/9;border-radius:12px;background:#0f172a;object-fit:contain;display:block}
.av-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 16px;border-radius:11px;font-size:14px;font-weight:500;cursor:pointer;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);white-space:nowrap;font-family:inherit}
.av-btn.cheio{border:none;color:#fefefe;background:var(--c);box-shadow:0 6px 14px -8px var(--c)}
.av-btn:disabled{opacity:.5;cursor:default}
.av-rec{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12.5px;color:#dc2626;background:rgba(220,38,38,.1)}
.av-rec svg{animation:av-pisca 1.2s infinite}
@keyframes av-pisca{50%{opacity:.25}}
.av-perg{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto}
.av-perg div{padding:8px 10px;border-radius:10px;background:var(--portal-bg-secondary,#f8fafc);font-size:13.5px}
.av-perg small{display:block;font-size:12px;color:var(--portal-text-muted,#64748b)}
.av-campo{flex:1;height:42px;padding:0 12px;border-radius:10px;border:1px solid var(--portal-border,#e5e7eb);background:var(--portal-bg,#fefefe);color:var(--portal-text,#111111);font-size:14px;font-family:inherit;outline:none;min-width:0}
`

export default function AoVivo({ reuniaoId, podeTransmitir, meuNome, perguntasIniciais, gravacoes, encerrada, onGravou }: {
  reuniaoId: string
  podeTransmitir: boolean
  meuNome: string
  perguntasIniciais: Pergunta[]
  gravacoes: Gravacao[]
  encerrada: boolean
  onGravou: () => void
}) {
  const [sid] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36))
  const [papel, setPapel] = useState<'nada' | 'transmitindo' | 'assistindo'>('nada')
  const [noAr, setNoAr] = useState<{ sid: string; nome: string; gravando: boolean; visto: number } | null>(null)
  const [assistindo, setAssistindo] = useState(0)
  const [conectado, setConectado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [gravar, setGravar] = useState(true)
  const [gravando, setGravando] = useState(false)
  const [enviando, setEnviando] = useState(0)
  const [perguntas, setPerguntas] = useState<Pergunta[]>(perguntasIniciais)
  const [texto, setTexto] = useState('')
  const [tocando, setTocando] = useState<{ key: string; url: string } | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  const papelRef = useRef(papel)
  useEffect(() => { papelRef.current = papel }, [papel])
  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const peers = useRef(new Map<string, RTCPeerConnection>())
  const pcViewer = useRef<RTCPeerConnection | null>(null)
  const filaIce = useRef<RTCIceCandidateInit[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const rec = useRef<{ mr: MediaRecorder | null; partes: Blob[]; n: number; inicio: string; timer: number | null }>({ mr: null, partes: [], n: 0, inicio: '', timer: null })
  const gravandoRef = useRef(false)
  const heartbeat = useRef<number | null>(null)

  const enviar = useCallback((event: string, payload: Record<string, unknown>) => { canal.current?.send({ type: 'broadcast', event, payload }) }, [])

  // ------------------------------------------------------------ gravação
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

  const novaParte = useCallback(() => {
    if (!stream.current || !gravandoRef.current) return
    const tipos = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
    const mimeType = tipos.find((t) => MediaRecorder.isTypeSupported(t)) || ''
    const mr = new MediaRecorder(stream.current, { mimeType, videoBitsPerSecond: 600_000, audioBitsPerSecond: 64_000 })
    const g = rec.current
    if (!g.inicio) g.inicio = new Date().toISOString()
    const inicioParte = new Date().toISOString(); const n = ++g.n; const pedacos: Blob[] = []
    mr.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data) }
    mr.onstop = () => {
      if (pedacos.length) void subirParte(new Blob(pedacos, { type: 'video/webm' }), n, inicioParte, new Date().toISOString())
      if (gravandoRef.current) novaParte()
    }
    mr.start(5000)
    g.mr = mr
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

  // ------------------------------------------------------------ WebRTC (quem transmite)
  const criarPeer = useCallback(async (viewer: string) => {
    if (!stream.current) return
    if (peers.current.has(viewer)) { peers.current.get(viewer)!.close(); peers.current.delete(viewer) }
    if (peers.current.size >= MAX_ASSISTINDO) { enviar('sinal', { to: viewer, from: sid, tipo: 'lotado' }); return }
    const pc = new RTCPeerConnection({ iceServers: ICE })
    peers.current.set(viewer, pc); setAssistindo(peers.current.size)
    stream.current.getTracks().forEach((t) => pc.addTrack(t, stream.current!))
    pc.onicecandidate = (e) => { if (e.candidate) enviar('sinal', { to: viewer, from: sid, tipo: 'ice', candidate: e.candidate.toJSON() }) }
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) { pc.close(); peers.current.delete(viewer); setAssistindo(peers.current.size) }
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    enviar('sinal', { to: viewer, from: sid, tipo: 'offer', sdp: offer })
  }, [enviar, sid])

  // ------------------------------------------------------------ WebRTC (quem assiste)
  const aoSinal = useCallback(async (s: Sinal) => {
    if (s.to !== sid) return
    if (papelRef.current === 'transmitindo') {
      const pc = peers.current.get(s.from); if (!pc) return
      if (s.tipo === 'answer' && s.sdp) await pc.setRemoteDescription(s.sdp)
      if (s.tipo === 'ice' && s.candidate) await pc.addIceCandidate(s.candidate).catch(() => {})
      return
    }
    if (papelRef.current !== 'assistindo') return
    if (s.tipo === 'lotado') { setAviso('Já tem gente demais assistindo. Tente de novo daqui a pouco.'); setPapel('nada'); return }
    if (s.tipo === 'offer' && s.sdp) {
      pcViewer.current?.close()
      const pc = new RTCPeerConnection({ iceServers: ICE }); pcViewer.current = pc
      pc.ontrack = (e) => { if (videoRef.current) { videoRef.current.srcObject = e.streams[0]; void videoRef.current.play().catch(() => {}) } }
      pc.onicecandidate = (e) => { if (e.candidate) enviar('sinal', { to: s.from, from: sid, tipo: 'ice', candidate: e.candidate.toJSON() }) }
      pc.onconnectionstatechange = () => setConectado(pc.connectionState === 'connected')
      await pc.setRemoteDescription(s.sdp)
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

  // ------------------------------------------------------------ canal
  useEffect(() => {
    const ch = supabase.channel(`reuniao-ao-vivo-${reuniaoId}`, { config: { broadcast: { self: false } } })
    ch.on('broadcast', { event: 'no-ar' }, ({ payload }) => setNoAr({ ...(payload as { sid: string; nome: string; gravando: boolean }), visto: Date.now() }))
      .on('broadcast', { event: 'fim' }, () => { setNoAr(null); if (papelRef.current === 'assistindo') { pcViewer.current?.close(); pcViewer.current = null; setConectado(false); setPapel('nada') } })
      .on('broadcast', { event: 'entrar' }, ({ payload }) => { if (papelRef.current === 'transmitindo') void criarPeer(String((payload as { sid: string }).sid)) })
      .on('broadcast', { event: 'sinal' }, ({ payload }) => { void aoSinal(payload as Sinal) })
      .on('broadcast', { event: 'pergunta' }, ({ payload }) => setPerguntas((l) => [...l, payload as Pergunta]))
      .subscribe()
    canal.current = ch
    const t = window.setInterval(() => setAgora(Date.now()), 3000)
    return () => { window.clearInterval(t); void supabase.removeChannel(ch); canal.current = null }
  }, [reuniaoId, criarPeer, aoSinal])

  // quem assiste e ainda não conectou pede de novo a cada sinal de "no ar"
  useEffect(() => {
    if (papel === 'assistindo' && noAr && !conectado) enviar('entrar', { sid })
  }, [papel, noAr, conectado, enviar, sid])

  // sair da página com gravação subindo = aviso do navegador
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => { if (papelRef.current === 'transmitindo' || enviando > 0) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', f)
    return () => window.removeEventListener('beforeunload', f)
  }, [enviando])

  const transmitir = async () => {
    setAviso('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = s
      papelRef.current = 'transmitindo'; setPapel('transmitindo')
      window.setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.muted = true; void videoRef.current.play().catch(() => {}) } }, 50)
      if (gravar) { gravandoRef.current = true; setGravando(true); rec.current = { mr: null, partes: [], n: 0, inicio: '', timer: null }; novaParte() }
      const bate = () => enviar('no-ar', { sid, nome: meuNome, gravando: gravandoRef.current })
      bate(); heartbeat.current = window.setInterval(bate, 3000)
    } catch { setAviso('Não deu para usar a câmera/microfone. Libere no navegador (cadeado ao lado do endereço) e tente de novo.') }
  }
  const pararTransmissao = () => {
    if (heartbeat.current) window.clearInterval(heartbeat.current)
    pararGravacao()
    enviar('fim', {})
    peers.current.forEach((pc) => pc.close()); peers.current.clear(); setAssistindo(0)
    stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null
    setPapel('nada')
  }
  const assistir = () => { setAviso(''); papelRef.current = 'assistindo'; setPapel('assistindo'); setConectado(false); enviar('entrar', { sid }) }
  const sairAssistir = () => { pcViewer.current?.close(); pcViewer.current = null; setConectado(false); setPapel('nada') }

  const perguntar = async () => {
    const t = texto.trim(); if (!t) return
    const p = { nome: meuNome, texto: t, em: new Date().toISOString() }
    setTexto(''); setPerguntas((l) => [...l, p]); enviar('pergunta', p)
    await chamar(`/api/reunioes/${reuniaoId}/gravacao`, { json: { acao: 'pergunta', texto: t } }).catch(() => setAviso('A pergunta apareceu na tela, mas não ficou salva.'))
  }
  const tocar = async (key: string) => {
    try { const j = await chamar<{ url: string }>(`/api/reunioes/${reuniaoId}/gravacao?key=${encodeURIComponent(key)}`); setTocando({ key, url: j.url }) }
    catch (e) { setAviso((e as Error).message) }
  }

  const alguemNoAr = !!noAr && agora - noAr.visto < 10_000 && papel !== 'transmitindo'
  const recentes = gravacoes.filter((g) => agora - new Date(g.inicio).getTime() < 60 * 86400_000)

  return (
    <div className="av" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{CSS}</style>

      {papel !== 'nada' && <video ref={videoRef} className="av-video" playsInline autoPlay controls={papel === 'assistindo'} />}

      {papel === 'transmitindo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)' }}>
          <span className="av-rec" style={{ color: '#dc2626' }}><Radio size={13} /> No ar</span>
          {gravando && <span className="av-rec"><Circle size={10} fill="#dc2626" /> Gravando</span>}
          <span><Eye size={14} style={{ verticalAlign: -2 }} /> {assistindo} assistindo</span>
          {enviando > 0 && <span><Loader2 size={14} className="fa-spin" style={{ verticalAlign: -2 }} /> subindo gravação…</span>}
          <span style={{ flex: 1 }} />
          <button className="av-btn cheio" style={{ ['--c' as string]: '#0f172a' }} onClick={pararTransmissao}><VideoOff size={15} /> Parar transmissão</button>
        </div>
      )}
      {papel === 'assistindo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)' }}>
          {conectado ? <span className="av-rec"><Radio size={13} /> Ao vivo</span> : <span><Loader2 size={14} className="fa-spin" style={{ verticalAlign: -2 }} /> Conectando…</span>}
          {noAr?.gravando && <span className="av-rec"><Circle size={10} fill="#dc2626" /> Esta reunião está sendo gravada</span>}
          <span style={{ flex: 1 }} />
          <button className="av-btn" onClick={sairAssistir}>Sair</button>
        </div>
      )}

      {papel === 'nada' && !encerrada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {alguemNoAr
            ? <button className="av-btn cheio" style={{ ['--c' as string]: '#dc2626' }} onClick={assistir}><Eye size={15} /> Assistir ao vivo · {noAr!.nome.split(' ')[0]} está transmitindo</button>
            : <span style={{ fontSize: 13.5, color: 'var(--portal-text-muted,#64748b)' }}>Ninguém transmitindo agora.</span>}
          <span style={{ flex: 1 }} />
          {podeTransmitir && !alguemNoAr && (
            <>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)', cursor: 'pointer' }}>
                <input type="checkbox" checked={gravar} onChange={(e) => setGravar(e.target.checked)} /> Gravar
              </label>
              <button className="av-btn cheio" style={{ ['--c' as string]: '#dc2626' }} onClick={transmitir}><Video size={15} /> Transmitir desta sala</button>
            </>
          )}
        </div>
      )}
      {papel === 'nada' && podeTransmitir && !alguemNoAr && !encerrada && gravar && (
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>Quem assiste vê o aviso de que está sendo gravado. A gravação fica guardada por 60 dias.</div>
      )}

      {aviso && <div style={{ fontSize: 13, color: '#b45309' }}>{aviso}</div>}

      {(papel !== 'nada' || perguntas.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>Perguntas de quem está assistindo</span>
          {perguntas.length === 0 && <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Nenhuma ainda.</span>}
          <div className="av-perg">
            {perguntas.map((p, i) => <div key={i}><small>{p.nome.split(' ')[0]} · {hora(p.em)}</small>{p.texto}</div>)}
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
          <span style={{ fontSize: 14, fontWeight: 500 }}>Gravações <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)', fontWeight: 400 }}>· ficam 60 dias</span></span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {recentes.map((g) => (
              <button key={g.key} className="av-btn" style={{ height: 38, ...(tocando?.key === g.key ? { borderColor: '#2563eb', color: '#2563eb' } : {}) }} onClick={() => void tocar(g.key)}>
                <PlayCircle size={15} /> Parte {g.parte} · {hora(g.inicio)}–{hora(g.fim)} · {mb(g.bytes)}
              </button>
            ))}
          </div>
          {tocando && <video key={tocando.key} className="av-video" src={tocando.url} controls autoPlay playsInline />}
        </div>
      )}
    </div>
  )
}
