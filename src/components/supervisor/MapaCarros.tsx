'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface Carro { placa: string; descricao?: string | null; pessoa_nome?: string | null; vinculo_tipo?: string | null }
interface Props { carros: Carro[] }

const hojeStr = () => new Date().toISOString().split('T')[0]
const fmtH = (iso: string) => { if (!iso) return '--:--'; try { const d = new Date(iso); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') } catch { return '--:--' } }
const fmtT = (min: number) => min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 > 0 ? String(min % 60).padStart(2, '0') + 'min' : '') : min + 'min'
const fmtData = (d: string) => { if (!d) return ''; const [y, m, dia] = d.split('-'); return `${dia}/${m}/${y.slice(2)}` }

export default function MapaCarros({ carros }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const liveLayerRef = useRef<any>(null)
  const rotaLayerRef = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [data, setData] = useState(hojeStr())
  const [placaSel, setPlacaSel] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resumo, setResumo] = useState<{ km: number; paradas: number; ini: string | null; fim: string | null; dirigindo: number } | null>(null)
  const [live, setLive] = useState<any[]>([])
  const [carroSel, setCarroSel] = useState<{ placa: string; nome: string } | null>(null)
  const [historico, setHistorico] = useState<any[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  // Carregar Leaflet
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).L) { setReady(true); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstance.current) return
    const L = (window as any).L
    mapInstance.current = L.map(mapRef.current).setView([-23.2, -49.37], 10)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapInstance.current)
    liveLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    rotaLayerRef.current = L.layerGroup().addTo(mapInstance.current)
  }, [ready])

  // Posições ao vivo (só quando a data é hoje)
  const carregarLive = useCallback(async () => {
    if (data !== hojeStr()) { setLive([]); return }
    try {
      const res = await fetch('/api/supervisor-vendas/veiculos?acao=posicoes&fonte=carros')
      if (res.ok) setLive(await res.json())
    } catch { /* */ }
  }, [data])

  useEffect(() => {
    carregarLive()
    const i = setInterval(carregarLive, 30000)
    return () => clearInterval(i)
  }, [carregarLive])

  // Desenhar markers ao vivo
  useEffect(() => {
    if (!mapInstance.current || !liveLayerRef.current || !ready) return
    const L = (window as any).L
    liveLayerRef.current.clearLayers()
    for (const v of live) {
      if (!v.lat || !v.lng) continue
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;gap:6px;background:rgba(15,23,42,0.95);padding:6px 12px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap">
          <div style="width:8px;height:8px;border-radius:50%;background:${v.ignicao ? '#22c55e' : '#ef4444'}"></div>
          <span style="color:#fff;font-size:12px;font-weight:700">${v.vendedor_nome || v.placa}</span>
          <span style="color:rgba(255,255,255,0.5);font-size:10px">${v.placa}</span>
        </div>`,
        iconSize: [180, 30], iconAnchor: [90, 15],
      })
      const marker = L.marker([v.lat, v.lng], { icon, zIndexOffset: 5000 })
      marker.bindPopup(`<div style="font-size:14px;font-weight:700">${v.vendedor_nome || '-'}</div>
        <div style="font-size:12px;color:#64748B">${v.placa} · ${v.modelo || ''}</div>
        <div style="font-size:12px;color:#64748B;margin-top:2px">${v.ignicao ? 'Em movimento' : 'Parado'} · ${v.velocidade || 0} km/h</div>`)
      marker.addTo(liveLayerRef.current)
    }
  }, [live, ready])

  // Histórico do carro (lista de dias salvos)
  const abrirCarro = useCallback(async (placa: string, nome: string) => {
    setCarroSel({ placa, nome })
    setPlacaSel(null); setResumo(null)
    rotaLayerRef.current?.clearLayers()
    setLoadingHist(true)
    try {
      const res = await fetch(`/api/supervisor-vendas/veiculos?acao=historico&placa=${encodeURIComponent(placa)}`)
      setHistorico(res.ok ? await res.json() : [])
    } catch { setHistorico([]) }
    setLoadingHist(false)
  }, [])

  const fecharCarro = useCallback(() => {
    setCarroSel(null); setHistorico([]); setPlacaSel(null); setResumo(null)
    setData(hojeStr())
    rotaLayerRef.current?.clearLayers()
  }, [])

  // Ver rota de um carro numa data
  const verRota = useCallback(async (placa: string, dataParam: string) => {
    if (!mapInstance.current || !rotaLayerRef.current) return
    const L = (window as any).L
    rotaLayerRef.current.clearLayers()
    setPlacaSel(dataParam)
    setData(dataParam)
    setLoading(true)
    setResumo(null)
    try {
      const res = await fetch(`/api/supervisor-vendas/veiculos?acao=rota&placa=${encodeURIComponent(placa)}&data=${dataParam}`)
      if (!res.ok) { setLoading(false); return }
      const rota = await res.json()
      const pontos = rota.pontos || []
      if (pontos.length === 0) { setLoading(false); setResumo({ km: 0, paradas: 0, ini: null, fim: null, dirigindo: 0 }); return }
      const coords = pontos.map((p: any) => [p.lat, p.lng])
      L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(rotaLayerRef.current)

      for (const p of (rota.paradas || [])) {
        if (!p.lat || !p.lng) continue
        const corP = p.duracao_min > 60 ? '#DC2626' : p.duracao_min > 30 ? '#EA580C' : '#F59E0B'
        const icon = L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center">
            <div style="background:${corP};color:#fff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;white-space:nowrap">${fmtT(p.duracao_min)}</div>
            <div style="width:10px;height:10px;border-radius:50%;background:${corP};border:2px solid #fff;margin-top:2px"></div>
          </div>`,
          iconSize: [60, 24], iconAnchor: [30, 24],
        })
        const m = L.marker([p.lat, p.lng], { icon })
        m.bindPopup(`<b>Parada ${fmtT(p.duracao_min)}</b><br>${fmtH(p.inicio)} - ${p.fim ? fmtH(p.fim) : 'agora'}`)
        m.addTo(rotaLayerRef.current)
      }
      // início (verde) e fim (vermelho)
      L.circleMarker(coords[0], { radius: 7, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(rotaLayerRef.current).bindPopup('Início ' + fmtH(rota.hora_inicio))
      L.circleMarker(coords[coords.length - 1], { radius: 7, fillColor: '#dc2626', color: '#fff', weight: 2, fillOpacity: 1 }).addTo(rotaLayerRef.current).bindPopup('Fim ' + fmtH(rota.hora_fim))

      mapInstance.current.fitBounds(coords, { padding: [50, 50] })
      setResumo({ km: rota.km_total || 0, paradas: (rota.paradas || []).length, ini: rota.hora_inicio, fim: rota.hora_fim, dirigindo: rota.tempo_dirigindo_min || 0 })
    } catch { /* */ }
    setLoading(false)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Painel de controle */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(255,255,255,0.97)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', width: 240, maxHeight: 'calc(100% - 20px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!carroSel ? (
          <>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: 0.3 }}>
              CARROS COMERCIAIS
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {carros.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhum carro comercial</div>
              ) : carros.map(c => (
                <button key={c.placa} onClick={() => abrirCarro(c.placa, c.pessoa_nome || c.placa)} style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f1f5f9',
                  background: 'transparent', cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{c.pessoa_nome || c.placa}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.placa}{c.descricao ? ` · ${c.descricao}` : ''}</div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={fecharCarro} style={{ background: '#f1f5f9', border: 'none', borderRadius: 7, width: 26, height: 26, cursor: 'pointer', fontSize: 15, lineHeight: 1, color: '#475569' }}>‹</button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{carroSel.nome}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{carroSel.placa}</div>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {/* Hoje (calcula ao vivo) */}
              <button onClick={() => verRota(carroSel.placa, hojeStr())} style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f1f5f9',
                background: placaSel === hojeStr() ? '#eff6ff' : 'transparent', cursor: 'pointer',
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: placaSel === hojeStr() ? '#2563eb' : '#1e293b' }}>Hoje</div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>ver rota de hoje</div>
              </button>
              {loadingHist ? (
                <div style={{ padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Carregando histórico…</div>
              ) : historico.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Sem histórico salvo</div>
              ) : historico.map((h: any) => {
                const ativo = placaSel === h.data
                return (
                  <button key={h.data} onClick={() => verRota(carroSel.placa, h.data)} style={{
                    width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f1f5f9',
                    background: ativo ? '#eff6ff' : 'transparent', cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: ativo ? '#2563eb' : '#1e293b' }}>{fmtData(h.data)}</div>
                    <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>{h.km_total} km</span>
                      <span style={{ color: '#d97706', fontWeight: 600 }}>{h.paradas} paradas</span>
                      <span style={{ color: '#059669', fontWeight: 600 }}>{fmtT(h.tempo_dirigindo_min)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>Carregando rota...</div>
      )}

      {resumo && placaSel && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#1E293B', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
          <span>{fmtData(placaSel)}</span>
          <span style={{ color: '#60a5fa' }}>{resumo.km} km</span>
          <span style={{ color: '#fbbf24' }}>{resumo.paradas} paradas</span>
          <span style={{ color: '#34d399' }}>{fmtT(resumo.dirigindo)} dirigindo</span>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>{fmtH(resumo.ini || '')} – {fmtH(resumo.fim || '')}</span>
        </div>
      )}
    </div>
  )
}
