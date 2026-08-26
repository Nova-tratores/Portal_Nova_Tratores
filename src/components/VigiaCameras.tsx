'use client'
// Atalho do cabeçalho: Vigia das câmeras (script na loja que escuta o
// DVR). Módulo `cameras` — o Admin escolhe quem vê este atalho.
//
// AVISO INDIVIDUAL: cada usuário liga/desliga O SEU aviso (com toque e
// volume próprios, salvos neste navegador). O evento chega em tempo real
// (Supabase Realtime) e toca AQUI no navegador — desligar o seu não
// afeta o dos outros.
//
// CONFIG GERAL (da loja): quais canais o vigia observa e se o PC da
// loja também toca — salva no portal, o vigia relê em 30s.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Cctv, Bell, BellOff, Monitor, Save,
  PersonStanding, Video, Check, X, Info, Tractor,
} from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { supabase } from '@/lib/supabase'

const CANAIS_NOMES: Record<number, string> = {
  1: 'Entrada Loja', 2: 'Pátio Loja', 3: 'Árvore', 4: 'Lavador e Torno',
  5: 'Lavador', 6: 'Fundo Loja', 7: 'Fundo Oficina', 8: 'Oficina Início',
  9: 'Salão Entrada', 10: 'Salão Saída', 11: 'Peças', 12: 'Financeiro',
  13: 'Adm Oficina', 14: 'Muro Posto', 15: 'Oficina Entrada', 16: 'Canal 16',
}

// Observações por canal (zonas desenhadas no DVR / filtros de IA)
const CANAIS_ZONAS: Record<number, string> = {
  5: 'só quando passa TRATOR (a IA confere a foto)',
}

// Toque fixo (pedido do usuário 26/08: sem escolha de som/volume — a
// chavinha decide se toca ou não; campainha em volume alto)
const TOQUE_FIXO = 'campainha'
const VOLUME_FIXO = 90

type ConfigGeral = { ativo: boolean; canais: number[]; som: string; volume: number; cooldownSeg: number }
type Pessoal = { ativo: boolean; canais: number[] }
type Evento = { quando: string; canal: number; codigo: string; fotoUrl?: string | null }
type Status = { atualizadoEm: string; canais: number[]; eventos: Evento[] }

const LS_PESSOAL = 'vigia-pessoal'

function lerPessoal(): Pessoal {
  try {
    const salvo = JSON.parse(localStorage.getItem(LS_PESSOAL) || '{}')
    return {
      ativo: salvo.ativo === true, // começa DESLIGADO — cada um liga o seu
      canais: Array.isArray(salvo.canais) && salvo.canais.length ? salvo.canais.map(Number) : [5], // canal 5 = o básico de todos
    }
  } catch { return { ativo: false, canais: [5] } }
}

// Toques sintetizados no navegador (mesmas receitas do vigia da loja)
function tocarToque(som: string, volume: number) {
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

// Chavinha (switch) estilo iOS
function Chave({ ligada, onClick }: { ligada: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={ligada}
      style={{
        width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: ligada ? '#16a34a' : '#94a3b8', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0, padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: ligada ? 23 : 3, width: 18, height: 18,
        borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

export default function VigiaCameras() {
  const [existe, setExiste] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [geral, setGeral] = useState<ConfigGeral>({ ativo: false, canais: [4, 5], som: 'dingdong', volume: 80, cooldownSeg: 30 })
  const [pessoal, setPessoal] = useState<Pessoal>({ ativo: false, canais: [5] })
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const pessoalRef = useRef(pessoal)
  pessoalRef.current = pessoal
  const ultimoSomRef = useRef(0)

  // prefs individuais deste navegador
  useEffect(() => { setPessoal(lerPessoal()) }, [])
  const salvarPessoal = (novo: Pessoal) => {
    setPessoal(novo)
    try { localStorage.setItem(LS_PESSOAL, JSON.stringify(novo)) } catch {}
  }

  const carregar = useCallback(async () => {
    try {
      // ts + no-store: sem cache de navegador segurando a lista antiga
      const r = await fetch(`/api/cameras/vigia?ts=${Date.now()}`, {
        headers: { ...(await authHeaders()) },
        cache: 'no-store',
      })
      if (!r.ok) return
      const j = await r.json()
      if (j.status) { setStatus(j.status); setExiste(true) }
      if (j.config) setGeral((prev) => ({ ...prev, ...j.config }))
    } catch { /* offline */ }
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 20000)
    return () => clearInterval(t)
  }, [carregar])

  // Evento em tempo real → toca AQUI se o MEU aviso estiver ligado
  useEffect(() => {
    const ch = supabase
      .channel('vigia-cameras')
      .on('broadcast', { event: 'movimento' }, ({ payload }) => {
        const p = pessoalRef.current
        setStatus((prev) => prev ? {
          ...prev,
          eventos: [{
            quando: new Date().toISOString(),
            canal: Number(payload?.canal) || 0,
            codigo: String(payload?.codigo || 'VideoMotion'),
            fotoUrl: payload?.fotoUrl || null,
          }, ...(prev.eventos || [])].slice(0, 40),
        } : prev)
        if (!p.ativo) return
        // só as câmeras que EU escolhi ouvir
        if (!p.canais.includes(Number(payload?.canal))) return
        // canal 5 só toca com TRATOR confirmado pela IA
        if (Number(payload?.canal) === 5 && payload?.codigo !== 'Trator') return
        // não metralha: no máximo um toque a cada 8s neste navegador
        if (Date.now() - ultimoSomRef.current < 8000) return
        ultimoSomRef.current = Date.now()
        tocarToque(TOQUE_FIXO, VOLUME_FIXO)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // fecha no Esc
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [aberto])

  // abre pelo item "Vigia das câmeras" do Menu do cabeçalho
  useEffect(() => {
    const abrir = () => setAberto(true)
    window.addEventListener('vigia-abrir', abrir)
    return () => window.removeEventListener('vigia-abrir', abrir)
  }, [])

  // veio de uma notificação do sino (?vigia=1) → já abre o modal
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('vigia') === '1') {
      setAberto(true)
    }
  }, [])

  const online = status ? Date.now() - new Date(status.atualizadoEm).getTime() < 3 * 60 * 1000 : false

  const salvarGeral = async () => {
    setSalvando(true); setSalvo(false)
    try {
      const r = await fetch('/api/cameras/vigia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(geral),
      })
      if (r.ok) { setSalvo(true); setTimeout(() => setSalvo(false), 2500) }
    } catch { /* sem rede */ }
    setSalvando(false)
  }

  const toggleCanal = (c: number) => {
    setGeral((prev) => ({
      ...prev,
      canais: prev.canais.includes(c) ? prev.canais.filter((x) => x !== c) : [...prev.canais, c].sort((a, b) => a - b),
    }))
  }

  if (!existe) return null // vigia nunca reportou → nem mostra o atalho

  const horaFmt = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const diaFmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

  const cartao: React.CSSProperties = {
    background: 'var(--portal-bg-hover)', border: '1px solid var(--portal-border)',
    borderRadius: 12, padding: 14,
  }
  const tituloSecao: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800,
    letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--portal-text-secondary)', marginBottom: 12,
  }
  const caixaInput: React.CSSProperties = {
    padding: '7px 9px', borderRadius: 9, border: '1px solid var(--portal-border)',
    background: 'var(--portal-bg-secondary)', color: 'inherit', fontSize: 13,
  }

  return (
    <>
      {aberto && (
        <div
          onClick={() => setAberto(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(15,23,42,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(720px, 96vw)', maxHeight: '88vh', overflowY: 'auto',
              background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
              borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', padding: 18,
            }}
          >
            {/* Cabeçalho */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{
                width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg, #dc2626, #991b1b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
              }}>
                <Cctv size={22} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16.5, fontWeight: 800, lineHeight: 1.2 }}>Vigia das câmeras</div>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
                  Aviso de movimento nas câmeras da loja
                </div>
              </div>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 999,
                fontSize: 11.5, fontWeight: 800, flexShrink: 0,
                background: online ? 'rgba(34,197,94,0.14)' : 'rgba(220,38,38,0.12)',
                color: online ? '#16a34a' : '#dc2626',
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: 'currentColor' }} />
                {online ? 'ONLINE' : 'OFFLINE'}
              </span>
              <button
                onClick={() => setAberto(false)}
                title="Fechar"
                style={{
                  width: 34, height: 34, borderRadius: 10, border: '1px solid var(--portal-border)',
                  background: 'var(--portal-bg-hover)', color: 'inherit', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}
              >
                <X size={17} />
              </button>
            </div>

            {/* Duas colunas: esquerda = configurações · direita = como funciona + disparos */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {/* ── Coluna esquerda ── */}
              <div style={{ flex: '1 1 320px', minWidth: 290, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* MEU AVISO */}
                <div style={cartao}>
                  <div style={tituloSecao}>
                    {pessoal.ativo ? <Bell size={14} /> : <BellOff size={14} />}
                    Meu aviso — só pra mim
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>Tocar neste computador</span>
                    <Chave ligada={pessoal.ativo} onClick={() => salvarPessoal({ ...pessoal, ativo: !pessoal.ativo })} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginBottom: 6, opacity: pessoal.ativo ? 1 : 0.5 }}>
                    Câmeras que EU ouço
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12, opacity: pessoal.ativo ? 1 : 0.5 }}>
                    {geral.canais.map((c) => {
                      const marcado = pessoal.canais.includes(c)
                      return (
                        <button
                          key={c}
                          disabled={!pessoal.ativo}
                          title={CANAIS_ZONAS[c] || undefined}
                          onClick={() => salvarPessoal({
                            ...pessoal,
                            canais: marcado ? pessoal.canais.filter((x) => x !== c) : [...pessoal.canais, c].sort((a, b) => a - b),
                          })}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 999,
                            fontSize: 12.5, cursor: pessoal.ativo ? 'pointer' : 'default',
                            border: `1px solid ${marcado ? '#16a34a' : 'var(--portal-border)'}`,
                            background: marcado ? 'rgba(34,197,94,0.12)' : 'var(--portal-bg-secondary)',
                            color: 'inherit', fontWeight: marcado ? 700 : 400,
                          }}
                        >
                          {marcado && <Check size={12} strokeWidth={3.5} style={{ color: '#16a34a' }} />}
                          {c} · {CANAIS_NOMES[c]}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* CONFIG GERAL */}
                <div style={cartao}>
                  <div style={tituloSecao}>
                    <Monitor size={14} />
                    Configuração geral — vale pra loja
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginBottom: 8 }}>
                    Câmeras vigiadas
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, maxHeight: 180, overflowY: 'auto', marginBottom: 12 }}>
                    {Array.from({ length: 16 }, (_, i) => i + 1).map((c) => {
                      const marcado = geral.canais.includes(c)
                      return (
                        <button
                          key={c}
                          onClick={() => toggleCanal(c)}
                          title={CANAIS_ZONAS[c] ? `Zona: ${CANAIS_ZONAS[c]}` : undefined}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8,
                            fontSize: 12.5, cursor: 'pointer', textAlign: 'left', minWidth: 0,
                            border: `1px solid ${marcado ? '#dc2626' : 'var(--portal-border)'}`,
                            background: marcado ? 'rgba(220,38,38,0.10)' : 'var(--portal-bg-secondary)',
                            color: 'inherit', fontWeight: marcado ? 700 : 400,
                          }}
                        >
                          <span style={{
                            width: 15, height: 15, borderRadius: 5, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: marcado ? '#dc2626' : 'transparent',
                            border: marcado ? 'none' : '1.5px solid var(--portal-border)', color: '#fff',
                          }}>
                            {marcado && <Check size={11} strokeWidth={3.5} />}
                          </span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c} · {CANAIS_NOMES[c]}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={salvarGeral}
                    disabled={salvando || geral.canais.length === 0}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      background: salvo ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13.5,
                      opacity: salvando ? 0.6 : 1, transition: 'background 0.2s',
                    }}
                  >
                    {salvo ? <Check size={16} /> : <Save size={15} />}
                    {salvo ? 'Salvo — o vigia aplica em até 30s' : salvando ? 'Salvando…' : 'Salvar configuração geral'}
                  </button>
                </div>
              </div>

              {/* ── Coluna direita ── */}
              <div style={{ flex: '1 1 300px', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* QUANDO APITA */}
                <div style={{ ...cartao, background: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.25)' }}>
                  <div style={tituloSecao}>
                    <Info size={14} />
                    Quando apita?
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, lineHeight: 1.45 }}>
                    <li><b>Canal 5 (Lavador)</b> — o básico de todos: só toca quando passa <b>TRATOR</b> (a IA olha a foto antes de avisar; carro e moto não tocam).</li>
                    <li>Toca no navegador de <b>quem estiver com o aviso ligado</b> — cada um liga o seu e escolhe as câmeras que ouve (começa desligado).</li>
                    <li>Intervalo mínimo entre avisos: <b>{geral.cooldownSeg}s por câmera</b> (e 8s por navegador) — pra não virar sino.</li>
                    <li>O vigia roda no PC da loja: <b>PC desligado/suspenso = sem aviso</b> (a bolinha fica vermelha).</li>
                  </ul>
                </div>

                {/* DISPAROS SEPARADOS POR CÂMERA (pedido 26/08) */}
                {([
                  {
                    titulo: 'Porta do escritório — canal 4',
                    icone: <PersonStanding size={14} />,
                    lista: (status?.eventos || []).filter((ev) => ev.canal === 4),
                    vazio: 'Ninguém chegou ainda.',
                  },
                  {
                    titulo: 'Tratores — canal 5',
                    icone: <Tractor size={14} />,
                    lista: (status?.eventos || []).filter((ev) => ev.canal === 5 && ev.codigo === 'Trator'),
                    vazio: 'Nenhum trator confirmado ainda.',
                  },
                ] as { titulo: string; icone: React.ReactNode; lista: Evento[]; vazio: string }[]).map((sec) => (
                  <div key={sec.titulo} style={cartao}>
                    <div style={tituloSecao}>
                      {sec.icone}
                      {sec.titulo}
                    </div>
                    <div style={{ maxHeight: 170, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {sec.lista.length === 0 && (
                        <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{sec.vazio}</span>
                      )}
                      {sec.lista.map((ev, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                          padding: '6px 8px', borderRadius: 8, background: 'var(--portal-bg-secondary)',
                          border: '1px solid var(--portal-border)',
                        }}>
                          <span style={{
                            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: ev.codigo === 'Trator' ? 'rgba(234,88,12,0.14)'
                              : (ev.codigo === 'SmartMotionHuman' || ev.codigo === 'Pessoa') ? 'rgba(34,197,94,0.14)' : 'rgba(220,38,38,0.10)',
                            color: ev.codigo === 'Trator' ? '#ea580c'
                              : (ev.codigo === 'SmartMotionHuman' || ev.codigo === 'Pessoa') ? '#16a34a' : '#dc2626',
                          }}>
                            {ev.codigo === 'Trator' ? <Tractor size={15} />
                              : (ev.codigo === 'SmartMotionHuman' || ev.codigo === 'Pessoa') ? <PersonStanding size={15} /> : <Video size={14} />}
                          </span>
                          {ev.fotoUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={ev.fotoUrl}
                              alt=""
                              title="Ver a foto do disparo"
                              onClick={() => window.open(ev.fotoUrl!, '_blank', 'noopener')}
                              style={{ width: 44, height: 33, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', flexShrink: 0, border: '1px solid var(--portal-border)' }}
                            />
                          )}
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <span style={{
                              fontSize: 11.5, fontWeight: 600,
                              color: ev.codigo === 'Trator' ? '#ea580c'
                                : (ev.codigo === 'SmartMotionHuman' || ev.codigo === 'Pessoa') ? '#16a34a' : 'var(--portal-text)',
                            }}>
                              {ev.codigo === 'Trator' ? 'Trator confirmado pela IA'
                                : (ev.codigo === 'SmartMotionHuman' || ev.codigo === 'Pessoa') ? 'Pessoa detectada' : 'Movimento detectado'}
                            </span>
                          </span>
                          <span style={{ flexShrink: 0, color: 'var(--portal-text-secondary)', fontSize: 11.5 }}>
                            {diaFmt(ev.quando)} {horaFmt(ev.quando)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
