'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface Props {
  visitas: any[]
  tipoCores: Record<string, { bg: string; text: string }>
  fmtData: (iso: string) => string
  onVisitaClick?: (visita: any) => void
}

export default function MapaVisitas({ visitas, tipoCores, fmtData, onVisitaClick }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const markersRef = useRef<any>(null)
  const veiculosLayerRef = useRef<any>(null)
  const rotaLayerRef = useRef<any>(null)
  const onClickRef = useRef(onVisitaClick)
  onClickRef.current = onVisitaClick
  const [ready, setReady] = useState(false)
  const [veiculos, setVeiculos] = useState<any[]>([])
  const [rotaPlaca, setRotaPlaca] = useState<string | null>(null)
  const [rotaLoading, setRotaLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).L) { setReady(true); return }
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
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
    markersRef.current = L.layerGroup().addTo(mapInstance.current)
    veiculosLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    rotaLayerRef.current = L.layerGroup().addTo(mapInstance.current)
  }, [ready])

  // Carregar veículos dos vendedores
  const carregarVeiculos = useCallback(async () => {
    try {
      const res = await fetch('/api/supervisor-vendas/veiculos?acao=posicoes')
      if (res.ok) setVeiculos(await res.json())
    } catch { /* */ }
  }, [])

  useEffect(() => {
    carregarVeiculos()
    const interval = setInterval(carregarVeiculos, 30000)
    return () => clearInterval(interval)
  }, [carregarVeiculos])

  // Ver rota de um veículo
  const verRota = useCallback(async (placa: string) => {
    if (!mapInstance.current || !rotaLayerRef.current) return
    const L = (window as any).L
    rotaLayerRef.current.clearLayers()

    if (rotaPlaca === placa) { setRotaPlaca(null); return }

    setRotaPlaca(placa)
    setRotaLoading(true)
    try {
      const res = await fetch(`/api/supervisor-vendas/veiculos?acao=rota&placa=${encodeURIComponent(placa)}`)
      if (!res.ok) return
      const rota = await res.json()
      const pontos = rota.pontos || []
      if (pontos.length === 0) return

      const coords = pontos.map((p: any) => [p.lat, p.lng])
      L.polyline(coords, { color: '#3b82f6', weight: 3, opacity: 0.7 }).addTo(rotaLayerRef.current)

      // Paradas na rota
      const fmtH = (iso: string) => { if (!iso) return '--:--'; try { const d = new Date(iso); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') } catch { return '--:--' } }
      const fmtT = (min: number) => min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 > 0 ? String(min % 60).padStart(2, '0') + 'min' : '') : min + 'min'
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

      // Info
      const infoIcon = L.divIcon({
        className: '',
        html: `<div style="background:#1E293B;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
          ${rota.km_total || 0} km | ${(rota.paradas || []).length} paradas | ${fmtH(rota.hora_inicio)} - ${fmtH(rota.hora_fim)}
        </div>`,
        iconSize: [200, 20], iconAnchor: [100, -10],
      })
      L.marker(coords[coords.length - 1], { icon: infoIcon, interactive: false }).addTo(rotaLayerRef.current)

      mapInstance.current.fitBounds(coords, { padding: [40, 40] })
    } catch { /* */ }
    setRotaLoading(false)
  }, [rotaPlaca])

  // Renderizar visitas
  useEffect(() => {
    if (!mapInstance.current || !markersRef.current) return
    const L = (window as any).L
    markersRef.current.clearLayers()

    const bounds: any[] = []
    const corMarcador: Record<string, string> = { presencial: '#1D4ED8', mensagem: '#059669', telefonema: '#D97706', email: '#7C3AED' }

    for (const v of visitas) {
      if (!v.latitude || !v.longitude) continue
      bounds.push([v.latitude, v.longitude])
      const cor = corMarcador[v.tipo] || '#475569'
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;flex-direction:column;align-items:center">
          <svg width="24" height="32" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">
            <path d="M15 38C15 38 28 22 28 14C28 6.82 22.18 1 15 1C7.82 1 2 6.82 2 14C2 22 15 38 15 38Z" fill="${cor}" stroke="#fff" stroke-width="2"/>
            <circle cx="15" cy="14" r="5" fill="#fff"/>
          </svg>
        </div>`,
        iconSize: [24, 32], iconAnchor: [12, 32],
      })
      const marker = L.marker([v.latitude, v.longitude], { icon })
      const popupId = `sv-popup-${v.id}`
      marker.bindPopup(`
        <div style="font-size:14px;font-weight:700">${v.vendedor_nome || '-'}</div>
        <div style="font-size:12px;color:#64748B">${fmtData(v.data_visita)}</div>
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;background:${tipoCores[v.tipo]?.bg || '#F1F5F9'};color:${tipoCores[v.tipo]?.text || '#475569'};margin-top:4px">${v.tipo}</span>
        ${v.cliente_nome ? `<div style="font-size:12px;margin-top:4px;font-weight:600">${v.cliente_nome}</div>` : ''}
        <button id="${popupId}" style="margin-top:8px;width:100%;padding:6px;border:none;border-radius:6px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Ver detalhes</button>
      `, { maxWidth: 260 })
      marker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.getElementById(popupId)
          if (btn) btn.onclick = () => { if (onClickRef.current) onClickRef.current(v) }
        }, 50)
      })
      marker.addTo(markersRef.current)
    }

    // Incluir veículos nos bounds
    for (const v of veiculos) {
      if (v.lat && v.lng) bounds.push([v.lat, v.lng])
    }

    if (bounds.length > 1) mapInstance.current.fitBounds(bounds, { padding: [40, 40] })
    else if (bounds.length === 1) mapInstance.current.setView(bounds[0], 13)
  }, [visitas, veiculos, ready, fmtData, tipoCores])

  // Renderizar veículos
  useEffect(() => {
    if (!mapInstance.current || !veiculosLayerRef.current || !ready) return
    const L = (window as any).L
    veiculosLayerRef.current.clearLayers()

    for (const v of veiculos) {
      if (!v.lat || !v.lng) continue
      const fmtH = (iso: string) => { if (!iso) return ''; try { const d = new Date(iso); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') } catch { return '' } }

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
      const popupRotaId = `sv-rota-${v.placa.replace(/[^A-Z0-9]/gi, '')}`
      const totalParadoMin = v.paradas_hoje.reduce((s: number, p: any) => s + (p.duracao_min || 0), 0)
      const fmtT = (min: number) => min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 > 0 ? String(min % 60).padStart(2, '0') + 'min' : '') : min + 'min'

      marker.bindPopup(`
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">${v.vendedor_nome || '-'}</div>
        <div style="font-size:12px;color:#64748B">${v.placa} · ${v.modelo || ''}</div>
        <div style="font-size:12px;color:#64748B;margin-top:2px">${v.ignicao ? 'Em movimento' : 'Parado'} · ${v.velocidade || 0} km/h</div>
        <div style="display:flex;gap:8px;margin-top:8px;font-size:12px;font-weight:700">
          <span style="color:#059669">${v.paradas_hoje.length} paradas</span>
          <span style="color:#DC2626">${fmtT(totalParadoMin)} parado</span>
        </div>
        ${v.dt_posicao ? `<div style="font-size:10px;color:#94A3B8;margin-top:4px">Atualizado: ${fmtH(v.dt_posicao)}</div>` : ''}
        <button id="${popupRotaId}" style="margin-top:8px;width:100%;padding:8px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-size:13px;font-weight:700;cursor:pointer">Ver rota do dia</button>
      `, { maxWidth: 280 })

      marker.on('popupopen', () => {
        setTimeout(() => {
          const btn = document.getElementById(popupRotaId)
          if (btn) btn.onclick = () => verRota(v.placa)
        }, 50)
      })

      marker.addTo(veiculosLayerRef.current)
    }
  }, [veiculos, ready, verRota])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {veiculos.length > 0 && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
          {veiculos.length} vendedor{veiculos.length > 1 ? 'es' : ''} em campo
        </div>
      )}
      {rotaLoading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
          Carregando rota...
        </div>
      )}
      {rotaPlaca && (
        <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: '#1E293B', color: '#fff', borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          onClick={() => { rotaLayerRef.current?.clearLayers(); setRotaPlaca(null) }}>
          Rota: {rotaPlaca} — clique pra fechar
        </div>
      )}
    </div>
  )
}
