'use client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'

interface Carro { placa: string; descricao?: string | null; pessoa_nome?: string | null; vinculo_tipo?: string | null }
// Lugar conhecido (geocerca ou propriedade de cliente) — vira um pin discreto
// no mapa, com botão pra ligar/desligar a camada.
export interface LocalPin {
  nome: string
  lat: number
  lng: number
  // loja | cliente | manutencao | estacionamento | descarga | propriedade | outro
  classe?: string | null
  subtitulo?: string | null
}
interface Props {
  carros: Carro[]
  visitas?: any[]
  tipoCores?: Record<string, { bg: string; text: string }>
  onVisitaClick?: (v: any) => void
  fmtVisita?: (iso: string) => string
  // 'carros' = só o comercial (default: comportamento original do supervisor);
  // 'frota'  = todos os rastreados (usado pelo /frota/mapa)
  fontePosicoes?: 'carros' | 'frota'
  tituloPainel?: string
  // pins de lugares conhecidos (default: nenhum — o supervisor fica como era)
  locais?: LocalPin[]
  // quem estava com o carro no dia (o /frota/mapa liga na vw_frota_uso_diario,
  // que lê o check-in do app dos mecânicos) — aparece no topo da timeline
  resolverMotorista?: (placa: string, data: string) => Promise<string | null>
}

const COR_LOCAL: Record<string, string> = {
  loja: '#0d9488', cliente: '#2563eb', propriedade: '#16a34a',
  manutencao: '#9333ea', estacionamento: '#64748b', descarga: '#d97706',
}

// Sem base de limite POR VIA (isso exigiria map-matching no OSM) — o alerta de
// velocidade usa o teto de rodovia: acima disso é excesso em QUALQUER via.
const LIMITE_VEL_KMH = 110

// Buraco de sinal não é trajeto: pontos consecutivos longe demais (ou com gap
// de tempo) NÃO são ligados por linha cheia — viram conector pontilhado.
const GAP_KM = 2
const GAP_MIN = 15

const distKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const hojeStr = () => new Date().toISOString().split('T')[0]
const fmtH = (iso: string) => { if (!iso) return '--:--'; try { const d = new Date(iso); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') } catch { return '--:--' } }
const fmtT = (min: number) => min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 > 0 ? String(min % 60).padStart(2, '0') + 'min' : '') : min + 'min'
const fmtData = (d: string) => { if (!d) return ''; const [y, m, dia] = d.split('-'); return `${dia}/${m}/${y.slice(2)}` }

export default function MapaCarros({ carros, visitas = [], tipoCores = {}, onVisitaClick, fmtVisita, fontePosicoes = 'carros', tituloPainel = 'CARROS COMERCIAIS', locais = [], resolverMotorista }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const liveLayerRef = useRef<any>(null)
  const rotaLayerRef = useRef<any>(null)
  const visitasLayerRef = useRef<any>(null)
  const locaisLayerRef = useRef<any>(null)
  const [mostrarLocais, setMostrarLocais] = useState(true)
  const [mostrarVisitas, setMostrarVisitas] = useState(true)
  const onVisitaClickRef = useRef(onVisitaClick)
  onVisitaClickRef.current = onVisitaClick
  const selecionarCarroRef = useRef<(placa: string, nome: string) => void>(() => {})
  const [ready, setReady] = useState(false)
  const [data, setData] = useState(hojeStr())
  const [placaSel, setPlacaSel] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resumo, setResumo] = useState<{ km: number; paradas: number; ini: string | null; fim: string | null; dirigindo: number; visitas: number } | null>(null)
  const [live, setLive] = useState<any[]>([])
  const [carroSel, setCarroSel] = useState<{ placa: string; nome: string } | null>(null)
  const [historico, setHistorico] = useState<any[]>([])
  const [loadingHist, setLoadingHist] = useState(false)
  // timeline da rota selecionada (onde passou, horários, paradas, velocidade)
  const [rotaSel, setRotaSel] = useState<any>(null)
  const [timelineAberta, setTimelineAberta] = useState(true)
  const [motoristaDia, setMotoristaDia] = useState<string | null>(null)

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
    visitasLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    locaisLayerRef.current = L.layerGroup().addTo(mapInstance.current)
  }, [ready])

  // Camada de lugares conhecidos (geocercas + propriedades de clientes) —
  // pins pequenos pra não competir com os carros; botão liga/desliga.
  useEffect(() => {
    if (!mapInstance.current || !locaisLayerRef.current || !ready) return
    const L = (window as any).L
    locaisLayerRef.current.clearLayers()
    if (!mostrarLocais) return
    for (const loc of locais) {
      if (!loc.lat || !loc.lng) continue
      const cor = COR_LOCAL[loc.classe || ''] || '#64748b'
      L.circleMarker([loc.lat, loc.lng], {
        radius: 6, weight: 2, color: '#fff', fillColor: cor, fillOpacity: 0.9,
      })
        .bindPopup(`<div style="font-size:13px;font-weight:700">${loc.nome}</div>${loc.subtitulo ? `<div style="font-size:11px;color:#64748B">${loc.subtitulo}</div>` : ''}`)
        .bindTooltip(loc.nome, { direction: 'top', offset: [0, -6] })
        .addTo(locaisLayerRef.current)
    }
  }, [locais, mostrarLocais, ready])

  // Posições ao vivo (só quando a data é hoje)
  const carregarLive = useCallback(async () => {
    if (data !== hojeStr()) { setLive([]); return }
    try {
      const res = await fetch(`/api/supervisor-vendas/veiculos?acao=posicoes&fonte=${fontePosicoes}`)
      if (res.ok) setLive(await res.json())
    } catch { /* */ }
  }, [data, fontePosicoes])

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
      const marker = L.marker([v.lat, v.lng], { icon, zIndexOffset: 5000, title: 'Clique para ver rota e histórico' })
      marker.on('click', () => selecionarCarroRef.current(v.placa, v.vendedor_nome || v.placa))
      marker.addTo(liveLayerRef.current)
    }
  }, [live, ready])

  // Marcadores de visitas a clientes (pins)
  useEffect(() => {
    if (!mapInstance.current || !visitasLayerRef.current || !ready) return
    const L = (window as any).L
    visitasLayerRef.current.clearLayers()
    if (!mostrarVisitas) return
    const fv = fmtVisita || ((iso: string) => { try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso || '' } })
    const corMarcador: Record<string, string> = { presencial: '#1D4ED8', mensagem: '#059669', telefonema: '#D97706', email: '#7C3AED' }
    for (const v of visitas) {
      if (!v.latitude || !v.longitude) continue
      const cor = corMarcador[v.tipo] || '#475569'
      const icon = L.divIcon({
        className: '',
        html: `<svg width="24" height="32" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">
          <path d="M15 38C15 38 28 22 28 14C28 6.82 22.18 1 15 1C7.82 1 2 6.82 2 14C2 22 15 38 15 38Z" fill="${cor}" stroke="#fff" stroke-width="2"/>
          <circle cx="15" cy="14" r="5" fill="#fff"/>
        </svg>`,
        iconSize: [24, 32], iconAnchor: [12, 32],
      })
      const marker = L.marker([v.latitude, v.longitude], { icon })
      const popupId = `sv-visit-${v.id}`
      // o botão "Ver detalhes" só existe quando a tela passou o handler
      // (o supervisor passa; o mapa da frota mostra só o popup informativo)
      const temHandler = !!onVisitaClick
      marker.bindPopup(`
        <div style="font-size:14px;font-weight:700">${v.vendedor_nome || '-'}</div>
        <div style="font-size:12px;color:#64748B">${fv(v.data_visita)}</div>
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;background:${tipoCores[v.tipo]?.bg || '#F1F5F9'};color:${tipoCores[v.tipo]?.text || '#475569'};margin-top:4px">${v.tipo}</span>
        ${v.cliente_nome ? `<div style="font-size:12px;margin-top:4px;font-weight:600">${v.cliente_nome}</div>` : ''}
        ${temHandler ? `<button id="${popupId}" style="margin-top:8px;width:100%;padding:6px;border:none;border-radius:6px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Ver detalhes</button>` : ''}
      `, { maxWidth: 260 })
      if (temHandler) {
        marker.on('popupopen', () => {
          setTimeout(() => { const btn = document.getElementById(popupId); if (btn) btn.onclick = () => onVisitaClickRef.current?.(v) }, 50)
        })
      }
      marker.addTo(visitasLayerRef.current)
    }
  }, [visitas, ready, tipoCores, fmtVisita, mostrarVisitas, onVisitaClick])

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
    setRotaSel(null); setMotoristaDia(null)
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
      setRotaSel(rota)
      setMotoristaDia(null)
      resolverMotorista?.(placa, dataParam).then((m) => setMotoristaDia(m)).catch(() => {})
      const pontos = rota.pontos || []
      if (pontos.length === 0) {
        // Dia sem trajeto OU rota antiga já podada pela retenção (os pontos
        // crus somem depois de 90 dias, os AGREGADOS ficam) — mostra o resumo
        // salvo em vez de "0 km".
        setLoading(false)
        setResumo({
          km: rota.km_total || 0,
          paradas: (rota.paradas || []).length,
          ini: rota.hora_inicio || null,
          fim: rota.hora_fim || null,
          dirigindo: rota.tempo_dirigindo_min || 0,
          visitas: (rota.visitas || []).length,
        })
        return
      }
      const coords = pontos.map((p: any) => [p.lat, p.lng])

      // Trajeto SEGMENTADO: buraco de sinal (pontos consecutivos a >2km ou
      // >15min) não vira linha reta cruzando o mapa — vira conector
      // pontilhado cinza com tooltip do tamanho do buraco.
      const segmentos: any[][] = []
      let seg: any[] = []
      for (const p of pontos) {
        if (seg.length > 0) {
          const prev = seg[seg.length - 1]
          const gapKm = distKm(prev, p)
          const gapMin = (new Date(p.dt).getTime() - new Date(prev.dt).getTime()) / 60000
          if (gapKm > GAP_KM || gapMin > GAP_MIN) {
            segmentos.push(seg)
            L.polyline([[prev.lat, prev.lng], [p.lat, p.lng]], { color: '#94a3b8', weight: 2, opacity: 0.55, dashArray: '6 8' })
              .bindTooltip(`sem sinal: ${gapKm > GAP_KM ? gapKm.toFixed(1) + ' km' : Math.round(gapMin) + ' min'} sem pontos`)
              .addTo(rotaLayerRef.current)
            seg = []
          }
        }
        seg.push(p)
      }
      if (seg.length > 0) segmentos.push(seg)
      for (const s of segmentos) {
        if (s.length >= 2) {
          L.polyline(s.map((p: any) => [p.lat, p.lng]), { color: '#3b82f6', weight: 4, opacity: 0.85 }).addTo(rotaLayerRef.current)
        }
      }

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

      // Visitas do dia feitas a até 2km de uma parada (pin)
      const corVis: Record<string, string> = { presencial: '#1D4ED8', mensagem: '#059669', telefonema: '#D97706', email: '#7C3AED' }
      for (const vis of (rota.visitas || [])) {
        if (!vis.lat || !vis.lng) continue
        const cv = corVis[vis.tipo] || '#475569'
        const icon = L.divIcon({
          className: '',
          html: `<svg width="22" height="30" viewBox="0 0 30 40" style="filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35))"><path d="M15 38C15 38 28 22 28 14C28 6.82 22.18 1 15 1C7.82 1 2 6.82 2 14C2 22 15 38 15 38Z" fill="${cv}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="14" r="5" fill="#fff"/></svg>`,
          iconSize: [22, 30], iconAnchor: [11, 30],
        })
        L.marker([vis.lat, vis.lng], { icon, zIndexOffset: 4000 })
          .bindPopup(`<div style="font-size:13px;font-weight:700">${vis.cliente_nome || 'Visita'}</div><div style="font-size:11px;color:#64748B">${vis.vendedor_nome || ''}${vis.tipo ? ` · ${vis.tipo}` : ''}</div><div style="font-size:11px;color:#059669;margin-top:2px">a ${vis.dist_parada_km} km de uma parada</div>`)
          .addTo(rotaLayerRef.current)
      }

      mapInstance.current.fitBounds(coords, { padding: [50, 50] })
      setResumo({ km: rota.km_total || 0, paradas: (rota.paradas || []).length, ini: rota.hora_inicio, fim: rota.hora_fim, dirigindo: rota.tempo_dirigindo_min || 0, visitas: (rota.visitas || []).length })
    } catch { /* */ }
    setLoading(false)
  }, [])

  // Clique no carro no mapa → abre histórico + já mostra a rota de hoje
  const abrirCarroNoMapa = useCallback((placa: string, nome: string) => {
    abrirCarro(placa, nome)
    verRota(placa, hojeStr())
  }, [abrirCarro, verRota])
  selecionarCarroRef.current = abrirCarroNoMapa

  // TIMELINE da rota selecionada: saída -> trechos (km, vel. máx) -> paradas
  // (onde, quanto tempo) -> fim. "Onde" = o lugar conhecido mais próximo
  // (geocercas + propriedades, prop `locais`) a até 500m.
  const timeline = useMemo(() => {
    const r = rotaSel
    if (!r || !Array.isArray(r.pontos) || r.pontos.length === 0) return []
    const pontos = r.pontos
    const paradas = [...(r.paradas || [])].sort((a: any, b: any) => String(a.inicio).localeCompare(String(b.inicio)))
    const localDe = (lat: number, lng: number): string | null => {
      let melhor: LocalPin | null = null, md = Infinity
      for (const l of locais) {
        const d = distKm({ lat, lng }, { lat: l.lat, lng: l.lng })
        if (d < md) { md = d; melhor = l }
      }
      return melhor && md <= 0.5 ? melhor.nome : null
    }
    const trecho = (deIso: string, ateIso: string) => {
      const janela = pontos.filter((p: any) => p.dt >= deIso && p.dt <= ateIso)
      if (janela.length < 2) return null
      let km = 0, velMax = 0
      for (let i = 1; i < janela.length; i++) {
        const d = distKm(janela[i - 1], janela[i])
        if (d < 5) km += d // salto de GPS não é km rodado
        velMax = Math.max(velMax, Number(janela[i].vel) || 0)
      }
      if (km < 0.3) return null
      const min = Math.max(1, Math.round((new Date(ateIso).getTime() - new Date(deIso).getTime()) / 60000))
      return { km: Math.round(km * 10) / 10, velMax: Math.round(velMax), min }
    }

    const evs: any[] = []
    evs.push({ tipo: 'inicio', hora: r.hora_inicio, local: localDe(pontos[0].lat, pontos[0].lng) })
    let cursor = pontos[0].dt
    for (const pa of paradas) {
      const t = trecho(cursor, pa.inicio)
      if (t) evs.push({ tipo: 'trecho', de: cursor, ate: pa.inicio, ...t })
      evs.push({ tipo: 'parada', hora: pa.inicio, fim: pa.fim, dur: pa.duracao_min, local: localDe(pa.lat, pa.lng), lat: pa.lat, lng: pa.lng })
      cursor = pa.fim || pa.inicio
    }
    const ultimo = pontos[pontos.length - 1]
    const tFinal = trecho(cursor, ultimo.dt)
    if (tFinal) evs.push({ tipo: 'trecho', de: cursor, ate: ultimo.dt, ...tFinal })
    evs.push({ tipo: 'fim', hora: r.hora_fim, local: localDe(ultimo.lat, ultimo.lng) })
    return evs
  }, [rotaSel, locais])

  const excessos = useMemo(
    () => timeline.filter((e) => e.tipo === 'trecho' && e.velMax > LIMITE_VEL_KMH).length,
    [timeline],
  )

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Painel de controle */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(255,255,255,0.97)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', width: 240, maxHeight: 'calc(100% - 20px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!carroSel ? (
          <>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: 0.3 }}>
              {tituloPainel}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {carros.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhum carro comercial</div>
              ) : carros.map(c => (
                // mesmo comportamento do clique no marcador: abre o painel E já
                // desenha a rota de hoje (antes só abria o histórico)
                <button key={c.placa} onClick={() => abrirCarroNoMapa(c.placa, c.pessoa_nome || c.placa)} style={{
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
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
              <button onClick={fecharCarro} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                background: 'linear-gradient(135deg, #dc2626, #991b1b)', color: '#fff', border: 'none', borderRadius: 9,
                padding: '9px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.2,
                boxShadow: '0 3px 10px rgba(220,38,38,0.4)',
              }}>
                ✕ Desselecionar carro
              </button>
              <div style={{ minWidth: 0, marginTop: 9 }}>
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
                      {h.visitas > 0 && <span style={{ color: '#6366f1', fontWeight: 600 }}>{h.visitas} visita{h.visitas !== 1 ? 's' : ''}</span>}
                      <span style={{ color: '#059669', fontWeight: 600 }}>{fmtT(h.tempo_dirigindo_min)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Liga/desliga as camadas de contexto (aparecem quando a tela passou os dados) */}
      {(locais.length > 0 || visitas.length > 0) && (
        <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 1000, display: 'flex', gap: 6 }}>
          {visitas.length > 0 && (
            <button
              onClick={() => setMostrarVisitas((v) => !v)}
              title={mostrarVisitas ? 'Ocultar as visitas dos vendedores' : 'Mostrar as visitas dos vendedores'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: mostrarVisitas ? '#1d4ed8' : 'rgba(255,255,255,0.97)',
                color: mostrarVisitas ? '#fff' : '#475569',
                boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: mostrarVisitas ? '#93c5fd' : '#94a3b8' }} />
              Visitas ({visitas.length})
            </button>
          )}
          {locais.length > 0 && (
            <button
              onClick={() => setMostrarLocais((v) => !v)}
              title={mostrarLocais ? 'Ocultar clientes e geocercas' : 'Mostrar clientes e geocercas'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: mostrarLocais ? '#0f766e' : 'rgba(255,255,255,0.97)',
                color: mostrarLocais ? '#fff' : '#475569',
                boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: mostrarLocais ? '#5eead4' : '#94a3b8' }} />
              Locais ({locais.length})
            </button>
          )}
        </div>
      )}

      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>Carregando rota...</div>
      )}

      {resumo && placaSel && (
        <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#1E293B', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
          <span>{fmtData(placaSel)}</span>
          <span style={{ color: '#60a5fa' }}>{resumo.km} km</span>
          <span style={{ color: '#fbbf24' }}>{resumo.paradas} paradas</span>
          {resumo.visitas > 0 && <span style={{ color: '#818cf8' }}>{resumo.visitas} visita{resumo.visitas !== 1 ? 's' : ''}</span>}
          <span style={{ color: '#34d399' }}>{fmtT(resumo.dirigindo)} dirigindo</span>
          <span style={{ color: '#94a3b8', fontWeight: 500 }}>{fmtH(resumo.ini || '')} – {fmtH(resumo.fim || '')}</span>
          {timeline.length > 0 && (
            <button onClick={() => setTimelineAberta((v) => !v)} style={{ background: timelineAberta ? '#334155' : '#0d9488', border: 'none', color: '#fff', borderRadius: 7, padding: '4px 10px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
              🕒 timeline{excessos > 0 ? ` · ${excessos}⚠` : ''}
            </button>
          )}
        </div>
      )}

      {/* TIMELINE — onde passou, que horas, paradas, velocidade e o motorista do dia */}
      {timelineAberta && timeline.length > 0 && placaSel && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, width: 292, maxHeight: 'calc(100% - 20px)', background: 'rgba(255,255,255,0.98)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#334155', letterSpacing: 0.3 }}>🕒 TIMELINE — {fmtData(placaSel)}</span>
              <button onClick={() => setTimelineAberta(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ fontSize: 11.5, color: '#475569', marginTop: 3 }}>
              🧑‍🔧 Motorista do dia: <strong>{motoristaDia || 'não marcado no app'}</strong>
            </div>
            {excessos > 0 && (
              <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, marginTop: 2 }}>
                ⚠ {excessos} trecho{excessos > 1 ? 's' : ''} acima de {LIMITE_VEL_KMH} km/h
              </div>
            )}
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {timeline.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, position: 'relative', paddingBottom: 10 }}>
                {/* trilho vertical */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', marginTop: 3, flexShrink: 0,
                    background: e.tipo === 'inicio' ? '#22c55e' : e.tipo === 'fim' ? '#dc2626' : e.tipo === 'parada' ? '#f59e0b' : (e.velMax > LIMITE_VEL_KMH ? '#dc2626' : '#3b82f6'),
                    border: '2px solid #fff', boxShadow: '0 0 0 1px #cbd5e1',
                  }} />
                  {i < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: '#e2e8f0', marginTop: 2 }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {e.tipo === 'inicio' && (
                    <div style={{ fontSize: 12, color: '#334155' }}>
                      <strong>{fmtH(e.hora)}</strong> · saiu{e.local ? <> de <strong>{e.local}</strong></> : ''}
                    </div>
                  )}
                  {e.tipo === 'trecho' && (
                    <div style={{ fontSize: 11.5, color: '#475569' }}>
                      {fmtH(e.de)}–{fmtH(e.ate)} · rodou <strong>{e.km} km</strong> em {fmtT(e.min)}
                      <span style={{ color: e.velMax > LIMITE_VEL_KMH ? '#dc2626' : '#64748b', fontWeight: e.velMax > LIMITE_VEL_KMH ? 800 : 500 }}>
                        {' '}· máx {e.velMax} km/h{e.velMax > LIMITE_VEL_KMH ? ' ⚠' : ''}
                      </span>
                    </div>
                  )}
                  {e.tipo === 'parada' && (
                    <div style={{ fontSize: 12, color: '#334155' }}>
                      <strong>{fmtH(e.hora)}</strong> · parou {fmtT(e.dur)}{' '}
                      {e.local
                        ? <>em <strong>{e.local}</strong></>
                        : <a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}>ver local ↗</a>}
                    </div>
                  )}
                  {e.tipo === 'fim' && (
                    <div style={{ fontSize: 12, color: '#334155' }}>
                      <strong>{fmtH(e.hora)}</strong> · fim do trajeto{e.local ? <> em <strong>{e.local}</strong></> : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
