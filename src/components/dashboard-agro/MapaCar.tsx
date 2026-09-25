'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapPin, RefreshCw, AlertTriangle } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

// Guia "Mapa" do /dashboard-agro: os imóveis rurais (CAR) de um município como
// polígonos coloridos pela cultura principal do perfil, com clique mostrando
// perfil, crédito, cliente vinculado e sugestões; pins das visitas do CRM por cima.
// Dados vêm de /api/agro/mapa (funções de sql/agro-mapa.sql, polígonos já
// simplificados no banco). Leaflet carregado do unpkg como no MapaVisitas do Supervisor.

const VERDE = '#16a34a'
const VERDE_ESCURO = '#15803d'

// cor por cultura principal (código de agro_dominio_cultura); null = diversificado
const CORES: Record<string, string> = {
  soja: '#facc15', milho: '#fb923c', sorgo: '#f97316', trigo: '#eab308', feijao: '#a16207', algodao: '#e5e7eb', arroz: '#7dd3fc',
  horti: '#f472b6', outras_temp: '#fdba74', cana: '#a3e635', cafe: '#7c2d12', citros: '#f59e0b', outras_peren: '#c084fc',
  pastagem: '#4ade80', silvicultura: '#166534', mosaico: '#9ca3af', outro: '#6b7280',
}
const COR_DIVERSIFICADO = '#cbd5e1'
const CONF_ROTULO: Record<string, string> = { alta: 'alta', media: 'média', baixa: 'baixa' }

type Municipio = { ibge: number; nome: string; imoveis: number; com_perfil: number; centro: [number, number] | null }

function brl(n?: number | null) {
  return n == null ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function ha(n?: number | null) {
  return n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' ha'
}
function fmtData(d?: string | null) {
  if (!d) return '—'
  const [y, m, dd] = String(d).slice(0, 10).split('-')
  return `${dd}/${m}/${y}`
}
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

function popupImovel(p: any): string {
  const cor = p.cultura ? (CORES[p.cultura] || '#6b7280') : COR_DIVERSIFICADO
  return `
  <div style="font:13px/1.45 system-ui,sans-serif;min-width:250px;max-width:320px">
    <div style="font-weight:800;font-size:14px;margin-bottom:4px">${esc(p.cultura_nome || 'Diversificado')}
      <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${cor};margin-left:6px"></span>
      ${p.confianca ? `<span style="font-size:11px;font-weight:700;color:${p.confianca === 'alta' ? '#15803d' : p.confianca === 'media' ? '#b45309' : '#6b7280'}"> · confiança ${esc(CONF_ROTULO[p.confianca] || p.confianca)}</span>` : ''}
    </div>
    <div style="font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#6b7280;word-break:break-all">${esc(p.cod_car)}</div>
    <table style="font-size:12px;margin-top:6px;border-collapse:collapse">
      <tr><td style="color:#6b7280;padding:1px 8px 1px 0">Área</td><td>${ha(p.area_ha)} (útil ${ha(p.area_util_ha)})</td></tr>
      ${p.cultura ? `<tr><td style="color:#6b7280;padding:1px 8px 1px 0">Cultura</td><td>${ha(p.area_cultura_ha)} · ${p.pct != null ? Number(p.pct).toFixed(0) + '% da área útil' : ''}</td></tr>` : ''}
      <tr><td style="color:#6b7280;padding:1px 8px 1px 0">Crédito 36 m</td><td>${brl(p.credito_36m)}${Number(p.invest_36m) > 0 ? ` <b>(invest. ${brl(p.invest_36m)})</b>` : ''}${p.ultimo_credito_em ? ` · último ${fmtData(p.ultimo_credito_em)}` : ''}</td></tr>
      <tr><td style="color:#6b7280;padding:1px 8px 1px 0">Score</td><td><b>${p.score != null ? Number(p.score).toFixed(1) : '—'}</b></td></tr>
      <tr><td style="color:#6b7280;padding:1px 8px 1px 0">Cliente</td><td>${p.clientes ? `<b>${esc(p.clientes)}</b>` : (Number(p.sugestoes) > 0 ? `<span style="color:#b45309">${p.sugestoes} sugestão(ões) pendente(s) — guia Vínculos</span>` : '<span style="color:#6b7280">sem vínculo</span>')}</td></tr>
      ${Number(p.sobreposicao_pct) > 20 ? `<tr><td style="color:#6b7280;padding:1px 8px 1px 0">Sobreposição</td><td style="color:#b45309">${Number(p.sobreposicao_pct).toFixed(0)}% com outro CAR</td></tr>` : ''}
    </table>
    ${p.motivo ? `<div style="font-size:11px;color:#6b7280;margin-top:6px">${esc(p.motivo)}</div>` : ''}
    ${p.condicao ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">SICAR: ${esc(p.condicao)}</div>` : ''}
  </div>`
}

export default function MapaCar() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapa = useRef<any>(null)
  const camadaCar = useRef<any>(null)
  const camadaVis = useRef<any>(null)
  const [pronto, setPronto] = useState(false)
  const [municipios, setMunicipios] = useState<Municipio[]>([])
  const [ibge, setIbge] = useState<string>(() => { try { return localStorage.getItem('agro-mapa-municipio') || '' } catch { return '' } })
  const [dados, setDados] = useState<any>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [culturasOcultas, setCulturasOcultas] = useState<Set<string>>(new Set())
  const [confMin, setConfMin] = useState<'todas' | 'media' | 'alta'>('todas')
  const [soCredito, setSoCredito] = useState(false)
  const [mostrarVisitas, setMostrarVisitas] = useState(true)

  // Leaflet do unpkg (mesmo caminho do Supervisor)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).L) { setPronto(true); return }
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link)
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => setPronto(true); document.head.appendChild(s)
  }, [])

  useEffect(() => {
    if (!pronto || !mapRef.current || mapa.current) return
    const L = (window as any).L
    mapa.current = L.map(mapRef.current, { preferCanvas: true }).setView([-23.2, -49.37], 10)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 19 }).addTo(mapa.current)
    camadaCar.current = L.layerGroup().addTo(mapa.current)
    camadaVis.current = L.layerGroup().addTo(mapa.current)
    return () => { mapa.current?.remove(); mapa.current = null }
  }, [pronto])

  // municípios
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/agro/mapa', { headers: await authHeaders() })
        const j = await r.json()
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
        setMunicipios(j.municipios || [])
        if (!ibge && j.municipios?.length) setIbge(String(j.municipios.find((m: Municipio) => m.ibge === 3538808)?.ibge || j.municipios[0].ibge))
      } catch (e: any) { setErro(e?.message || 'Falha ao listar municípios') }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // imóveis do município
  const carregar = useCallback(async () => {
    if (!ibge) return
    setCarregando(true); setErro(null)
    try {
      try { localStorage.setItem('agro-mapa-municipio', ibge) } catch { /* ok */ }
      const r = await fetch(`/api/agro/mapa?municipio=${ibge}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setDados(j)
    } catch (e: any) { setErro(e?.message || 'Falha ao carregar o município'); setDados(null) }
    finally { setCarregando(false) }
  }, [ibge])
  useEffect(() => { carregar() }, [carregar])

  const passa = useCallback((p: any) => {
    const cult = p.cultura || '_div'
    if (culturasOcultas.has(cult)) return false
    if (confMin === 'alta' && p.confianca !== 'alta') return false
    if (confMin === 'media' && !(p.confianca === 'alta' || p.confianca === 'media')) return false
    if (soCredito && !(Number(p.credito_36m) > 0)) return false
    return true
  }, [culturasOcultas, confMin, soCredito])

  // desenha
  useEffect(() => {
    if (!pronto || !mapa.current || !dados) return
    const L = (window as any).L
    camadaCar.current.clearLayers(); camadaVis.current.clearLayers()
    const feats = (dados.features || []).filter((f: any) => passa(f.properties))
    const geo = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      style: (f: any) => {
        const p = f.properties
        const cor = p.cultura ? (CORES[p.cultura] || '#6b7280') : COR_DIVERSIFICADO
        const op = p.confianca === 'alta' ? 0.75 : p.confianca === 'media' ? 0.55 : 0.35
        return { color: p.clientes ? '#1d4ed8' : '#374151', weight: p.clientes ? 2 : 0.6, fillColor: cor, fillOpacity: op }
      },
      onEachFeature: (f: any, layer: any) => {
        layer.bindPopup(popupImovel(f.properties), { maxWidth: 340 })
        layer.on('mouseover', () => layer.setStyle({ weight: 2.5, color: '#111111' }))
        layer.on('mouseout', () => geo.resetStyle(layer))
      },
    })
    camadaCar.current.addLayer(geo)
    if (mostrarVisitas) {
      for (const v of dados.visitas || []) {
        const m = L.circleMarker([v.lat, v.lng], { radius: 5, color: '#fefefe', weight: 1.5, fillColor: v.tipo === 'presencial' ? '#1d4ed8' : '#7c3aed', fillOpacity: 0.95 })
        m.bindPopup(`<div style="font:12px/1.4 system-ui"><b>${esc(v.cliente || 'cliente?')}</b><br>${fmtData(v.dia)} · ${esc(v.vendedor)} · ${esc(v.tipo)}<br><span style="color:#6b7280">${esc(v.resumo || '')}</span></div>`)
        camadaVis.current.addLayer(m)
      }
    }
    const b = geo.getBounds()
    if (b.isValid()) mapa.current.fitBounds(b, { padding: [20, 20] })
  }, [pronto, dados, passa, mostrarVisitas])

  // resumo pra legenda (do município inteiro, não do filtro)
  const legenda = useMemo(() => {
    const cont: Record<string, { n: number; nome: string }> = {}
    for (const f of dados?.features || []) {
      const p = f.properties; const k = p.cultura || '_div'
      cont[k] = cont[k] || { n: 0, nome: p.cultura_nome || 'Diversificado / sem perfil' }; cont[k].n++
    }
    return Object.entries(cont).sort((a, b) => b[1].n - a[1].n)
  }, [dados])
  const visiveis = useMemo(() => (dados?.features || []).filter((f: any) => passa(f.properties)).length, [dados, passa])
  const munAtual = municipios.find((m) => String(m.ibge) === ibge)

  const chip = (ativo: boolean, cor = VERDE_ESCURO): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${ativo ? cor : 'var(--portal-border,#e5e7eb)'}`, background: ativo ? 'rgba(22,163,74,0.10)' : 'transparent',
    color: 'var(--portal-text,#111111)', opacity: ativo ? 1 : 0.55, userSelect: 'none',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* barra */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg-card,#fefefe)' }}>
        <MapPin size={18} style={{ color: VERDE }} />
        <select value={ibge} onChange={(e) => setIbge(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg-input,#fefefe)', color: 'var(--portal-text,#111111)', fontSize: 13, fontWeight: 700 }}>
          {!municipios.length && <option value="">carregando municípios…</option>}
          {municipios.map((m) => <option key={m.ibge} value={String(m.ibge)}>{m.nome} ({m.imoveis.toLocaleString('pt-BR')})</option>)}
        </select>
        <select value={confMin} onChange={(e) => setConfMin(e.target.value as any)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg-input,#fefefe)', color: 'var(--portal-text,#111111)', fontSize: 12 }}>
          <option value="todas">Qualquer confiança</option><option value="media">Confiança média ou alta</option><option value="alta">Só confiança alta</option>
        </select>
        <label style={chip(soCredito)} onClick={() => setSoCredito((v) => !v)}><input type="checkbox" readOnly checked={soCredito} style={{ margin: 0 }} /> com crédito 36 m</label>
        <label style={chip(mostrarVisitas, '#1d4ed8')} onClick={() => setMostrarVisitas((v) => !v)}><input type="checkbox" readOnly checked={mostrarVisitas} style={{ margin: 0 }} /> visitas do CRM {dados?.visitas?.length ? `(${dados.visitas.length})` : ''}</label>
        <button type="button" onClick={carregar} style={{ ...chip(false), cursor: 'pointer', opacity: 1 }}><RefreshCw size={12} /> Atualizar</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--portal-text-muted,#6b7280)' }}>
          {carregando ? 'Carregando…' : dados ? `${visiveis.toLocaleString('pt-BR')} de ${(dados.features || []).length.toLocaleString('pt-BR')} imóveis ativos${munAtual ? ` · ${munAtual.com_perfil.toLocaleString('pt-BR')} com perfil` : ''}` : ''}
        </span>
      </div>
      {erro && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', background: 'rgba(220,38,38,0.10)', borderLeft: '4px solid #dc2626', color: 'var(--portal-text,#111111)', fontSize: 13 }}>
          <AlertTriangle size={16} style={{ color: '#dc2626' }} /> {erro}
        </div>
      )}
      {/* legenda clicável */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 14px', background: 'var(--portal-bg,#f9fafb)', borderBottom: '1px solid var(--portal-border,#e5e7eb)' }}>
        {legenda.map(([k, v]) => (
          <span key={k} style={chip(!culturasOcultas.has(k))} onClick={() => setCulturasOcultas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: k === '_div' ? COR_DIVERSIFICADO : (CORES[k] || '#6b7280'), border: '1px solid rgba(0,0,0,.25)' }} />
            {v.nome} <b>{v.n}</b>
          </span>
        ))}
        {!!legenda.length && <span style={{ fontSize: 11, color: 'var(--portal-text-muted,#6b7280)', alignSelf: 'center' }}>· opacidade = confiança · borda azul = cliente vinculado · pino azul = visita presencial</span>}
      </div>
      <div ref={mapRef} style={{ flex: 1, minHeight: 320, background: '#e5e7eb' }} />
    </div>
  )
}
