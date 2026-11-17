'use client'
// Player de UMA gravação (uma transmissão, do "Transmitir" ao "Parar") que por dentro são partes de 5 min.
// José, 17/11/2026: "assistir uma atrás da outra e não parecer que são arquivos divididos".
// • Barra de tempo única com a duração total (tempo de cada parte = fim − início gravados).
// • Dois <video>: um toca, o outro já carrega a parte seguinte — a troca é imediata.
// • Arrastar a barra leva para qualquer ponto (abre a parte certa e pula para o segundo dentro dela).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react'
import type { Gravacao } from './AoVivo'

const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const ss = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}

const CSS = `
.pg{position:relative;border-radius:12px;overflow:hidden;background:#0f172a;user-select:none}
.pg video{width:100%;aspect-ratio:16/9;object-fit:contain;display:block;background:#0f172a}
.pg video.escondido{position:absolute;inset:0;opacity:0;pointer-events:none}
.pg-barra{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:10px;padding:10px 12px;background:linear-gradient(transparent,rgba(15,23,42,.85));color:#fefefe;font-size:13px;font-variant-numeric:tabular-nums}
.pg-barra button{display:grid;place-items:center;width:36px;height:36px;border:none;border-radius:9px;background:rgba(255,255,255,.12);color:#fefefe;cursor:pointer;flex:none}
.pg-barra input[type=range]{flex:1;accent-color:#3b82f6;min-width:60px;height:24px;cursor:pointer}
.pg-carregando{position:absolute;inset:0;display:grid;place-items:center;color:#fefefe;pointer-events:none}
.pg:fullscreen{border-radius:0;display:flex;align-items:center}
.pg:fullscreen video{height:100%;aspect-ratio:auto}
`

export default function PlayerGravacao({ partes, linkDe }: { partes: Gravacao[]; linkDe: (key: string) => Promise<string> }) {
  const caixa = useRef<HTMLDivElement>(null)
  const vA = useRef<HTMLVideoElement>(null)
  const vB = useRef<HTMLVideoElement>(null)
  const el = (lado: number) => (lado === 0 ? vA : vB).current
  const [ativo, setAtivo] = useState(0)            // qual dos dois <video> está na tela
  const [idx, setIdx] = useState(0)                // parte que está tocando
  const [urls, setUrls] = useState<string[]>([])
  const [tempo, setTempo] = useState(0)            // segundos desde o começo da gravação
  const [tocando, setTocando] = useState(false)
  const [mudo, setMudo] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const pular = useRef<number | null>(null)        // segundo a pular dentro da parte quando ela abrir

  // duração de cada parte pelos horários gravados (o webm do navegador não traz a duração)
  const dur = useMemo(() => partes.map((g) => Math.max(1, (new Date(g.fim).getTime() - new Date(g.inicio).getTime()) / 1000)), [partes])
  const comeco = useMemo(() => dur.map((_, i) => dur.slice(0, i).reduce((a, b) => a + b, 0)), [dur])
  const total = dur.reduce((a, b) => a + b, 0)

  useEffect(() => {
    let vivo = true
    Promise.all(partes.map((g) => linkDe(g.key))).then((u) => {
      if (!vivo) return
      setUrls(u)
      // começa já: 1ª parte na tela, 2ª carregando por trás
      const a = vA.current; const b = vB.current
      if (a && u[0]) { a.src = u[0]; void a.play().catch(() => {}) }
      if (b && u[1]) { b.src = u[1]; b.preload = 'auto'; b.load() }
    }).catch(() => {})
    return () => { vivo = false }
  }, [partes, linkDe])

  // põe a parte i no vídeo da tela e a i+1 no de trás
  const carregar = useCallback((i: number, lado: number, segundo = 0, play = true) => {
    const v = el(lado); const outro = el(1 - lado)
    if (!v || !urls[i]) return
    setCarregando(true)
    if (v.src !== urls[i]) { pular.current = segundo; v.src = urls[i] } else { v.currentTime = segundo; pular.current = null }
    if (play) void v.play().catch(() => {})
    if (outro && urls[i + 1] && outro.src !== urls[i + 1]) { outro.src = urls[i + 1]; outro.preload = 'auto'; outro.load() }
    setIdx(i); setAtivo(lado)
  }, [urls])


  const aoTerminar = () => {
    if (idx + 1 >= partes.length) { setTocando(false); return }
    // a próxima já está carregada no vídeo de trás: só troca e toca
    const lado = 1 - ativo; const v = el(lado)
    if (v && v.src === urls[idx + 1]) {
      v.currentTime = 0; void v.play().catch(() => {}); setAtivo(lado); setIdx(idx + 1)
      const outro = el(ativo)
      if (outro && urls[idx + 2]) { outro.src = urls[idx + 2]; outro.preload = 'auto'; outro.load() }
    } else carregar(idx + 1, lado)
  }

  const irPara = (t: number) => {
    let i = comeco.findIndex((c, k) => t >= c && t < c + dur[k]); if (i < 0) i = partes.length - 1
    const dentro = Math.max(0, t - comeco[i])
    setTempo(t)
    if (i === idx) { const v = el(ativo); if (v) v.currentTime = dentro }
    else carregar(i, ativo, dentro, tocando || true)
  }

  const alternar = () => { const v = el(ativo); if (!v) return; if (v.paused) void v.play().catch(() => {}); else v.pause() }
  const telaCheia = () => {
    const c = caixa.current; const v = el(ativo) as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (document.fullscreenElement) { void document.exitFullscreen(); return }
    if (c?.requestFullscreen) c.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.())
    else v?.webkitEnterFullscreen?.()
  }

  return (
    <div className="pg" ref={caixa}>
      <style>{CSS}</style>
      {[0, 1].map((lado) => (
        <video key={lado} ref={lado === 0 ? vA : vB} playsInline muted={mudo} preload="auto"
          className={lado === ativo ? '' : 'escondido'}
          onClick={lado === ativo ? alternar : undefined}
          onLoadedMetadata={(e) => { if (lado === ativo && pular.current != null) { e.currentTarget.currentTime = pular.current; pular.current = null } }}
          onCanPlay={() => { if (lado === ativo) setCarregando(false) }}
          onWaiting={() => { if (lado === ativo) setCarregando(true) }}
          onPlay={() => { if (lado === ativo) setTocando(true) }}
          onPause={() => { if (lado === ativo) setTocando(false) }}
          onTimeUpdate={(e) => { if (lado === ativo) setTempo(comeco[idx] + Math.min(e.currentTarget.currentTime, dur[idx])) }}
          onEnded={() => { if (lado === ativo) aoTerminar() }} />
      ))}
      {carregando && <div className="pg-carregando"><Loader2 size={28} className="fa-spin" /></div>}
      <div className="pg-barra">
        <button onClick={alternar} aria-label={tocando ? 'Pausar' : 'Tocar'}>{tocando ? <Pause size={17} /> : <Play size={17} />}</button>
        <span>{mmss(tempo)} / {mmss(total)}</span>
        <input type="range" min={0} max={Math.max(1, Math.floor(total))} step={1} value={Math.floor(tempo)} onChange={(e) => irPara(Number(e.target.value))} aria-label="Tempo da gravação" />
        <button onClick={() => setMudo(!mudo)} aria-label={mudo ? 'Ligar o som' : 'Tirar o som'}>{mudo ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
        <button onClick={telaCheia} aria-label="Tela cheia"><Maximize size={17} /></button>
      </div>
    </div>
  )
}
