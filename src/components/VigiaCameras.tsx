'use client'
// Atalho do cabeçalho: Vigia das câmeras (script na loja que escuta o
// DVR e toca um som quando detecta movimento). Aqui dá pra ver se está
// online, o que disparou, e ESCOLHER canais, toque e volume — a config
// vai pro portal e o vigia obedece sozinho (relê a cada 30s).
import { useCallback, useEffect, useRef, useState } from 'react'
import { Cctv } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

const CANAIS_NOMES: Record<number, string> = {
  1: 'Entrada Loja', 2: 'Pátio Loja', 3: 'Árvore', 4: 'Lavador e Torno',
  5: 'Lavador', 6: 'Fundo Loja', 7: 'Fundo Oficina', 8: 'Oficina Início',
  9: 'Salão Entrada', 10: 'Salão Saída', 11: 'Peças', 12: 'Financeiro',
  13: 'Adm Oficina', 14: 'Muro Posto', 15: 'Oficina Entrada', 16: 'Canal 16',
}

const TOQUES = [
  { id: 'dingdong', nome: 'Ding-dong' },
  { id: 'campainha', nome: 'Campainha' },
  { id: 'alerta', nome: 'Alerta (3 bipes)' },
  { id: 'sino', nome: 'Sino' },
]

type Config = { canais: number[]; som: string; volume: number; cooldownSeg: number }
type Evento = { quando: string; canal: number; codigo: string }
type Status = { atualizadoEm: string; canais: number[]; eventos: Evento[] }

// Mesmos toques do vigia, sintetizados no navegador pro "ouvir" do painel
function tocarPreview(som: string, volume: number) {
  try {
    const ctx = new AudioContext()
    const vol = Math.max(0.02, volume / 100)
    const nota = (freq: number, inicio: number, dur: number) => {
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.frequency.value = freq; o.type = 'sine'
      g.gain.setValueAtTime(0, ctx.currentTime + inicio)
      g.gain.linearRampToValueAtTime(vol * 0.6, ctx.currentTime + inicio + 0.03)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + dur)
      o.connect(g); g.connect(ctx.destination)
      o.start(ctx.currentTime + inicio); o.stop(ctx.currentTime + inicio + dur + 0.05)
    }
    if (som === 'campainha') { nota(1200, 0, 0.18); nota(1200, 0.25, 0.18); nota(1200, 0.5, 0.3) }
    else if (som === 'alerta') { nota(600, 0, 0.16); nota(800, 0.2, 0.16); nota(1000, 0.4, 0.28) }
    else if (som === 'sino') { nota(1320, 0, 1.1) }
    else { nota(880, 0, 0.4); nota(660, 0.4, 0.55) } // dingdong
    setTimeout(() => ctx.close().catch(() => {}), 2500)
  } catch { /* navegador sem áudio */ }
}

export default function VigiaCameras() {
  const [existe, setExiste] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [config, setConfig] = useState<Config>({ canais: [9], som: 'dingdong', volume: 80, cooldownSeg: 30 })
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const painelRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/cameras/vigia', { headers: { ...(await authHeaders()) } })
      if (!r.ok) return
      const j = await r.json()
      if (j.status) { setStatus(j.status); setExiste(true) }
      if (j.config) setConfig((prev) => ({ ...prev, ...j.config }))
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 60000)
    return () => clearInterval(t)
  }, [carregar])

  // fecha clicando fora
  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      if (painelRef.current && !painelRef.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  const online = status ? Date.now() - new Date(status.atualizadoEm).getTime() < 3 * 60 * 1000 : false

  const salvar = async () => {
    setSalvando(true); setSalvo(false)
    try {
      const r = await fetch('/api/cameras/vigia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(config),
      })
      if (r.ok) { setSalvo(true); setTimeout(() => setSalvo(false), 2500) }
    } catch { /* sem rede */ }
    setSalvando(false)
  }

  const toggleCanal = (c: number) => {
    setConfig((prev) => ({
      ...prev,
      canais: prev.canais.includes(c) ? prev.canais.filter((x) => x !== c) : [...prev.canais, c].sort((a, b) => a - b),
    }))
  }

  if (!existe) return null // sem vigia rodando nunca → nem mostra o atalho

  const horaFmt = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const diaFmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  return (
    <div ref={painelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setAberto(!aberto)}
        title={online ? `Vigia das câmeras — online (canais ${(status?.canais || []).join(', ')})` : 'Vigia das câmeras — offline (PC da loja desligado?)'}
        style={{
          position: 'relative', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
          color: 'var(--portal-text-secondary)', cursor: 'pointer', padding: '11px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#dc2626' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }}
      >
        <Cctv size={20} />
        <span style={{
          position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: 6,
          background: online ? '#22c55e' : '#dc2626', border: '2px solid var(--portal-header-bg)',
        }} />
      </button>

      {aberto && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 10px)', width: 340, zIndex: 300,
          background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 14,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>Vigia das câmeras</b>
            <span style={{ fontSize: 12, fontWeight: 700, color: online ? '#16a34a' : '#dc2626' }}>
              {online ? '● online' : '● offline'}
            </span>
          </div>

          {/* Canais vigiados */}
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--portal-text-secondary)' }}>CANAIS VIGIADOS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, maxHeight: 150, overflowY: 'auto', marginBottom: 10 }}>
            {Array.from({ length: 16 }, (_, i) => i + 1).map((c) => (
              <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer', padding: '2px 4px' }}>
                <input type="checkbox" checked={config.canais.includes(c)} onChange={() => toggleCanal(c)} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c} · {CANAIS_NOMES[c]}</span>
              </label>
            ))}
          </div>

          {/* Toque + volume */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <select
              value={config.som}
              onChange={(e) => setConfig({ ...config, som: e.target.value })}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'inherit', fontSize: 13 }}
            >
              {TOQUES.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <button
              onClick={() => tocarPreview(config.som, config.volume)}
              title="Ouvir o toque"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', cursor: 'pointer', fontSize: 13, color: 'inherit' }}
            >
              ▶ ouvir
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)', width: 52 }}>Volume</span>
            <input
              type="range" min={5} max={100} value={config.volume}
              onChange={(e) => setConfig({ ...config, volume: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, width: 34, textAlign: 'right' }}>{config.volume}%</span>
          </div>

          <button
            onClick={salvar}
            disabled={salvando || config.canais.length === 0}
            style={{
              width: '100%', padding: '9px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: salvo ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13.5,
              opacity: salvando ? 0.6 : 1, marginBottom: 12,
            }}
          >
            {salvo ? '✓ Salvo — o vigia aplica em até 30s' : salvando ? 'Salvando…' : 'Salvar configuração'}
          </button>

          {/* Últimos disparos */}
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--portal-text-secondary)' }}>ÚLTIMOS DISPAROS</div>
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(status?.eventos || []).length === 0 && (
              <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>Nenhum disparo registrado ainda.</span>
            )}
            {(status?.eventos || []).map((ev, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '3px 6px', borderRadius: 6, background: 'var(--portal-bg-hover)' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.codigo === 'SmartMotionHuman' ? '🧍' : '🎥'} Canal {ev.canal} · {CANAIS_NOMES[ev.canal] || ''}
                </span>
                <span style={{ flexShrink: 0, color: 'var(--portal-text-secondary)' }}>{diaFmt(ev.quando)} {horaFmt(ev.quando)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
