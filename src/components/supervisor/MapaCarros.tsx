'use client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { distKm, filtrarEspetos, segmentarTrajeto } from '@/lib/frota/gps'
import { useIsMobile } from '@/hooks/useIsMobile'
import { fetchAuth } from '@/lib/auth/client'
import { carregarLeaflet } from '@/components/feedbacks/leaflet'
import { agruparPorProximidade, contarPorStatus, diaBR, haQuanto, nomeRumo, STATUS_INFO, statusVivo, type StatusVivo } from '@/lib/frota/mapa-vivo'
import { fmtMin } from '@/lib/frota/tempo-loja'
import { formatarPlaca } from '@/lib/frota/placa'
import type { VeiculoVivo } from '@/lib/frota/mapa-vivo-server'

interface Carro { placa: string; descricao?: string | null; pessoa_nome?: string | null; vinculo_tipo?: string | null }

// nomes vêm do CRM / geocercas / cadastro — nunca interpolar cru no HTML do Leaflet
const kmBR = (km: number) => `${(Math.round(km * 10) / 10).toLocaleString('pt-BR')} km`
const esc = (s: unknown) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] || c))

const ICONE_CARRO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>'
const ORDEM_STATUS: StatusVivo[] = ['andando', 'ligado_parado', 'desligado', 'sem_sinal']

// Bloco "tempo da loja até aqui" que vai dentro dos popups (preenchido depois
// que a rota /api/frota/mapa/tempo-loja responde).
const PLACEHOLDER_TEMPO = '<div data-tempo-loja style="margin-top:6px;border-top:1px solid #e2e8f0;padding-top:5px;font-size:12px;color:#64748b">Calculando o tempo até a loja…</div>'
function htmlTempoLoja(d: any): string {
  if (!d || d.error) return '<span style="color:#b91c1c">Não foi possível calcular o tempo até a loja.</span>'
  if (d.naLoja) return '<b style="color:#334155">Na loja</b>'
  const linha = (rotulo: string, e: any) => {
    if (!e || e.min == null) return `<div>${rotulo}: <b>sem dados</b></div>`
    const det = e.fonte === 'historico'
      ? `${e.viagens} viage${e.viagens === 1 ? 'm' : 'ns'}${e.descartadas ? ` · ${e.descartadas} fora da curva` : ''}`
      : 'estimado pela distância'
    const km = e.kmRealizado != null ? ` · <b style="color:#0f172a">${kmBR(e.kmRealizado)}</b> rodados` : ''
    return `<div>${rotulo}: <b style="color:#0f172a">~${fmtMin(e.min)}</b>${km} <span style="color:#94a3b8">(${det})</span></div>`
  }
  const projetado = d.kmProjetado != null
    ? `<div style="margin-top:2px">Percurso projetado: <b style="color:#0f172a">${kmBR(d.kmProjetado)}</b> <span style="color:#94a3b8">(pela estrada)</span></div>`
    : ''
  return `<div style="font-weight:800;color:#334155;margin-bottom:2px">Tempo com a loja</div>` +
    linha('Ida da loja', d.ida) + linha('Volta à loja', d.volta) + projetado
}
// "Paulo Motta / Gabriel Moraes" → "Paulo" (o rótulo do carro é curto)
const primeiroNome = (s: string) => (s.split(' / ')[0] || '').trim().split(/\s+/)[0] || ''
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
  // "voar até" um ponto (busca de cliente do /frota/mapa) — default: nada,
  // o supervisor fica como era
  foco?: { lat: number; lng: number; nome?: string; subtitulo?: string } | null
  // 'frota' (/frota/mapa): lista e marcadores vêm de /api/frota/mapa/vivo (a
  // frota ATIVA, cada carro na última posição conhecida, com cor da situação);
  // camadas de contexto começam desligadas e as visitas são só as do dia.
  // 'supervisor' (default): comportamento original do supervisor de vendas.
  modo?: 'supervisor' | 'frota'
}

const COR_LOCAL: Record<string, string> = {
  loja: '#0d9488', cliente: '#2563eb', propriedade: '#16a34a',
  manutencao: '#9333ea', estacionamento: '#64748b', descarga: '#d97706',
}

// Sem base de limite POR VIA (isso exigiria map-matching no OSM) — o alerta de
// velocidade usa o teto de rodovia: acima disso é excesso em QUALQUER via.
const LIMITE_VEL_KMH = 110

// (distKm / filtrarEspetos / segmentarTrajeto vivem em lib/frota/gps — a
// régua anti-"linha fantasma" é compartilhada com o mini-mapa da Ficha)

// dia em horário de Brasília — toISOString (UTC) virava "amanhã" depois das 21h
const hojeStr = () => diaBR()
const fmtH = (iso: string) => { if (!iso) return '--:--'; try { const d = new Date(iso); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0') } catch { return '--:--' } }
const fmtT = (min: number) => min >= 60 ? Math.floor(min / 60) + 'h' + (min % 60 > 0 ? String(min % 60).padStart(2, '0') + 'min' : '') : min + 'min'
const fmtData = (d: string) => { if (!d) return ''; const [y, m, dia] = d.split('-'); return `${dia}/${m}/${y.slice(2)}` }

export default function MapaCarros({ carros, visitas = [], tipoCores = {}, onVisitaClick, fmtVisita, fontePosicoes = 'carros', tituloPainel = 'CARROS COMERCIAIS', locais = [], resolverMotorista, foco = null, modo = 'supervisor' }: Props) {
  const ehFrota = modo === 'frota'
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<any>(null)
  const LRef = useRef<any>(null)
  const liveLayerRef = useRef<any>(null)
  const rotaLayerRef = useRef<any>(null)
  const visitasLayerRef = useRef<any>(null)
  const locaisLayerRef = useRef<any>(null)
  const isMobile = useIsMobile()
  // no mapa da frota os carros são o assunto: contexto começa desligado
  const [mostrarLocais, setMostrarLocais] = useState(!ehFrota)
  const [mostrarVisitas, setMostrarVisitas] = useState(!ehFrota)
  const [vivos, setVivos] = useState<VeiculoVivo[]>([])
  const [vivosCarregados, setVivosCarregados] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null)
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  const [avisoRota, setAvisoRota] = useState<string | null>(null)
  const [zoom, setZoom] = useState(10)
  // camada Propriedades (CAR): contorno das fazendas dos municípios na tela
  const carLayerRef = useRef<any>(null)
  const carRendererRef = useRef<any>(null)
  const carCacheRef = useRef(new Map<number, any>())
  const [mostrarCar, setMostrarCar] = useState(false)
  const [carMunicipios, setCarMunicipios] = useState<{ ibge: number; nome: string; centro: [number, number] }[] | null>(null)
  const [carAviso, setCarAviso] = useState<string | null>(null)
  const [carCarregando, setCarCarregando] = useState(false)
  const [vistaTick, setVistaTick] = useState(0)
  // tempo loja ↔ ponto (frota): cache por ponto (~100 m) e clique no mapa
  const tempoCacheRef = useRef(new Map<string, any>())
  const cliqueMapaRef = useRef<((e: any) => void) | null>(null)
  // cada pedido de rota ganha um número: resposta atrasada de um clique
  // anterior não desenha por cima do carro escolhido depois
  const rotaReqRef = useRef(0)
  const rotaAbortRef = useRef<AbortController | null>(null)
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

  // Carregar Leaflet — UMA vez por página. Injetar o script de novo (efeito
  // rodando 2x, outra tela que também carrega) roda o leaflet.js outra vez e
  // TROCA o window.L: o mapa ficava de uma cópia e as linhas da rota de outra,
  // e a rota quebrava ao desenhar ("Cannot read properties of undefined (x)").
  useEffect(() => { carregarLeaflet(() => setReady(true)) }, [])

  useEffect(() => {
    if (!ready || !mapRef.current || mapInstance.current) return
    const L = (window as any).L
    LRef.current = L // a mesma cópia do Leaflet em tudo que este mapa desenhar
    mapInstance.current = L.map(mapRef.current).setView([-23.2, -49.37], 10)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(mapInstance.current)
    liveLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    rotaLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    visitasLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    locaisLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    mapInstance.current.on('zoomend', () => setZoom(mapInstance.current.getZoom()))
    mapInstance.current.on('moveend', () => setVistaTick((t) => t + 1))
    // clique em lugar vazio do mapa (frota): tempo da loja até ali
    mapInstance.current.on('click', (e: any) => cliqueMapaRef.current?.(e))
    carLayerRef.current = L.layerGroup().addTo(mapInstance.current)
    // muitos polígonos: desenho em canvas (SVG com ~900 contornos por município pesa)
    carRendererRef.current = L.canvas({ padding: 0.5 })
  }, [ready])

  // "Voar até" o ponto buscado (cliente/local) — abre um popup no destino.
  useEffect(() => {
    if (!ready || !mapInstance.current || !foco?.lat || !foco?.lng) return
    const L = LRef.current
    const esc = (s: string) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))
    mapInstance.current.flyTo([foco.lat, foco.lng], 15, { duration: 1.1 })
    L.popup({ offset: [0, -4] })
      .setLatLng([foco.lat, foco.lng])
      .setContent(
        `<b>${esc(foco.nome || 'Local')}</b>` +
        (foco.subtitulo ? `<br/><span style="font-size:11px;color:#666">${esc(foco.subtitulo)}</span>` : ''),
      )
      .openOn(mapInstance.current)
  }, [foco, ready])

  // Preenche o bloco "tempo com a loja" dentro de um popup aberto.
  const preencherTempoLoja = useCallback(async (raiz: HTMLElement | null | undefined, lat: number, lng: number) => {
    const el = raiz?.querySelector('[data-tempo-loja]') as HTMLElement | null
    if (!el) return
    const k = `${lat.toFixed(3)},${lng.toFixed(3)}`
    let d = tempoCacheRef.current.get(k)
    if (!d) {
      try {
        const r = await fetchAuth(`/api/frota/mapa/tempo-loja?lat=${lat}&lng=${lng}`)
        d = await r.json()
        if (r.ok) tempoCacheRef.current.set(k, d)
      } catch { d = { error: 'falha' } }
    }
    el.innerHTML = htmlTempoLoja(d)
  }, [])

  useEffect(() => {
    if (!ehFrota) { cliqueMapaRef.current = null; return }
    cliqueMapaRef.current = (e: any) => {
      const L = LRef.current
      if (!L || !mapInstance.current) return
      const pop = L.popup({ maxWidth: 260 })
        .setLatLng(e.latlng)
        .setContent(PLACEHOLDER_TEMPO.replace('margin-top:6px;border-top:1px solid #e2e8f0;padding-top:5px;', ''))
        .openOn(mapInstance.current)
      preencherTempoLoja(pop.getElement(), e.latlng.lat, e.latlng.lng)
    }
  }, [ehFrota, preencherTempoLoja])

  // Camada de lugares conhecidos (geocercas + propriedades de clientes) —
  // pins pequenos pra não competir com os carros; botão liga/desliga.
  useEffect(() => {
    if (!mapInstance.current || !locaisLayerRef.current || !ready) return
    const L = LRef.current
    locaisLayerRef.current.clearLayers()
    if (!mostrarLocais) return
    for (const loc of locais) {
      if (!loc.lat || !loc.lng) continue
      const cor = COR_LOCAL[loc.classe || ''] || '#64748b'
      const m = L.circleMarker([loc.lat, loc.lng], {
        radius: 6, weight: 2, color: '#fff', fillColor: cor, fillOpacity: 0.9, bubblingMouseEvents: false,
      })
        .bindPopup(`<div style="font-size:13px;font-weight:700">${esc(loc.nome)}</div>${loc.subtitulo ? `<div style="font-size:11px;color:#64748B">${esc(loc.subtitulo)}</div>` : ''}${ehFrota ? PLACEHOLDER_TEMPO : ''}`)
        .bindTooltip(esc(loc.nome), { direction: 'top', offset: [0, -6] })
      if (ehFrota) m.on('popupopen', (ev: any) => preencherTempoLoja(ev.popup.getElement(), loc.lat, loc.lng))
      m.addTo(locaisLayerRef.current)
    }
  }, [locais, mostrarLocais, ready, ehFrota, preencherTempoLoja])

  // Posições ao vivo. Supervisor: só quando a data é hoje (rota antiga).
  // Frota: sempre — cada carro na ÚLTIMA posição conhecida, com a situação.
  const carregarLive = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return // aba escondida não gasta API
    if (ehFrota) {
      try {
        const res = await fetchAuth('/api/frota/mapa/vivo')
        if (res.ok) {
          const d = await res.json()
          setVivos(Array.isArray(d.veiculos) ? d.veiculos : [])
          setAtualizadoEm(d.atualizado_em || null)
        }
      } catch { /* mantém a última leitura */ }
      setVivosCarregados(true)
      setAgoraMs(Date.now())
      return
    }
    if (data !== hojeStr()) { setLive([]); return }
    try {
      const res = await fetchAuth(`/api/supervisor-vendas/veiculos?acao=posicoes&fonte=${fontePosicoes}`)
      if (res.ok) setLive(await res.json())
    } catch { /* */ }
  }, [data, fontePosicoes, ehFrota])

  useEffect(() => {
    carregarLive()
    const i = setInterval(carregarLive, 30000)
    const aoVoltar = () => { if (!document.hidden) carregarLive() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [carregarLive])

  // Desenhar markers ao vivo
  useEffect(() => {
    if (!mapInstance.current || !liveLayerRef.current || !ready) return
    const L = LRef.current
    liveLayerRef.current.clearLayers()
    if (ehFrota) {
      // carros a até 150 m (o pátio da loja) viram UM marcador "N · Loja";
      // o carro escolhido sempre fica sozinho, com o halo
      const soltos: VeiculoVivo[] = []
      const escolhidoV = carroSel ? vivos.find((v) => v.placa === carroSel.placa) : undefined
      // raio de ~44 px na tela no zoom atual: de longe junta, de perto separa
      const mPorPx = (156543.03 * Math.cos((-23.2 * Math.PI) / 180)) / 2 ** zoom
      const raioKm = Math.max(0.15, (44 * mPorPx) / 1000)
      for (const grupo of agruparPorProximidade(vivos.filter((v) => v !== escolhidoV), raioKm)) {
        if (grupo.length === 1) { soltos.push(grupo[0]); continue }
        const sts = grupo.map((v) => statusVivo(v, agoraMs))
        const bolinhas = ORDEM_STATUS.filter((s) => sts.includes(s))
          .map((s) => `<span style="width:9px;height:9px;border-radius:50%;background:${STATUS_INFO[s].cor};border:1.5px solid #fff"></span>`).join('')
        // nome do lugar só quando todos estão nele (senão "3 carros" basta)
        const lugar = grupo.every((v) => v.local && v.local === grupo[0].local) ? grupo[0].local || '' : ''
        const icon = L.divIcon({
          className: '',
          html: `<div style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:2px solid #1e293b;border-radius:16px;padding:4px 9px 4px 6px;box-shadow:0 2px 8px rgba(0,0,0,0.35);white-space:nowrap;opacity:${carroSel ? 0.45 : 1};font:800 12px Inter,sans-serif;color:#0f172a">
            <span style="display:inline-flex;gap:2px">${bolinhas}</span>${grupo.length} carros${lugar && lugar !== 'Sem cadastro de local' ? ` · ${esc(lugar)}` : ''}
          </div>`,
          iconSize: [150, 28], iconAnchor: [20, 14],
        })
        const linhas = grupo.map((v, i) => {
          const st = sts[i]
          return `<button data-placa="${esc(v.placa)}" style="display:flex;gap:8px;align-items:center;width:100%;text-align:left;border:none;border-top:${i ? '1px solid #e2e8f0' : 'none'};background:none;padding:6px 2px;cursor:pointer">
            <span style="width:10px;height:10px;border-radius:50%;background:${STATUS_INFO[st].cor};flex-shrink:0"></span>
            <span><b style="font-size:12.5px;color:#0f172a">${esc(v.nome || v.placa_exibicao)}</b><br/><span style="font-size:11px;color:#64748b">${esc(v.placa_exibicao)} · ${esc(haQuanto(v.dt, agoraMs))}</span></span>
          </button>`
        }).join('')
        const m = L.marker([grupo[0].lat, grupo[0].lng], { icon, zIndexOffset: 5500 })
          .bindPopup(`<div style="font-size:12px;font-weight:800;color:#334155;margin-bottom:4px">${grupo.length} carros${lugar ? ` · ${esc(lugar)}` : ''}</div>${linhas}`, { maxWidth: 260 })
        m.on('popupopen', (e: any) => {
          e.popup.getElement()?.querySelectorAll('[data-placa]').forEach((b: HTMLElement) => {
            b.onclick = () => {
              const v = grupo.find((x) => x.placa === b.dataset.placa)
              if (!v) return
              mapInstance.current?.closePopup()
              selecionarCarroRef.current(v.placa, v.nome || v.placa_exibicao)
            }
          })
        })
        m.addTo(liveLayerRef.current)
      }
      if (escolhidoV) soltos.push(escolhidoV)
      for (const v of soltos) {
        if (v.lat == null || v.lng == null) continue
        // a situação é recalculada com o relógio local (o "há X min" anda sozinho)
        const st = statusVivo(v, agoraMs)
        const cor = STATUS_INFO[st].cor
        const escolhido = carroSel?.placa === v.placa
        const apagado = !!carroSel && !escolhido
        // seta de direção: só andando e com rumo calculado pelos últimos pontos
        const seta = st === 'andando' && v.rumo != null
          ? `<div style="position:absolute;inset:-3px;transform:rotate(${v.rumo}deg);pointer-events:none"><div style="position:absolute;left:50%;top:-13px;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:12px solid ${cor};filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 1px 2px rgba(0,0,0,0.4))"></div></div>`
          : ''
        const icon = L.divIcon({
          className: '',
          html: `<div style="display:flex;flex-direction:column;align-items:center;opacity:${apagado ? 0.35 : 1}">
            <div style="position:relative;width:30px;height:30px;border-radius:50%;background:${cor};border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:${escolhido ? `0 0 0 5px ${cor}55,` : ''}0 2px 6px rgba(0,0,0,0.45)">${seta}${ICONE_CARRO}</div>
            <div style="margin-top:2px;background:rgba(15,23,42,0.9);color:#fff;font:700 10.5px Inter,sans-serif;padding:1px 6px;border-radius:4px;white-space:nowrap">${v.nome ? `${esc(primeiroNome(v.nome))} · ` : ''}${esc(v.placa_exibicao)}</div>
            ${v.os_execucao?.length ? `<div style="margin-top:1px;background:#15803d;color:#fff;font:700 9.5px Inter,sans-serif;padding:0 5px;border-radius:4px;white-space:nowrap">${esc(v.os_execucao[0].id)}</div>` : ''}
          </div>`,
          iconSize: [140, 64], iconAnchor: [70, 18],
        })
        const marker = L.marker([v.lat, v.lng], { icon, zIndexOffset: escolhido ? 6000 : 5000 })
        marker.bindTooltip(
          `<b>${esc(v.nome || v.placa_exibicao)}</b>${v.nome ? ` · ${esc(v.placa_exibicao)}` : ''}<br/>` +
          `<span style="color:${cor};font-weight:700">${STATUS_INFO[st].label}</span>${st === 'andando' && v.rumo != null ? ` para o ${nomeRumo(v.rumo)}` : ''} · ${esc(haQuanto(v.dt, agoraMs))}` +
          (v.local ? `<br/>${esc(v.local)}` : '') +
          (v.os_execucao || []).map((o) => `<br/><span style="color:#15803d;font-weight:700">${esc(o.id)}</span> em execução${o.cliente ? ` · ${esc(o.cliente)}` : ''}`).join(''),
          { direction: 'top', offset: [0, -20] },
        )
        marker.on('click', () => selecionarCarroRef.current(v.placa, v.nome || v.placa_exibicao))
        marker.addTo(liveLayerRef.current)
      }
      return
    }
    for (const v of live) {
      if (!v.lat || !v.lng) continue
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;align-items:center;gap:6px;background:rgba(15,23,42,0.95);padding:6px 12px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.3);white-space:nowrap">
          <div style="width:8px;height:8px;border-radius:50%;background:${v.ignicao ? '#22c55e' : '#ef4444'}"></div>
          <span style="color:#fff;font-size:12px;font-weight:700">${esc(v.vendedor_nome || v.placa)}</span>
          ${v.vendedor_nome ? `<span style="color:rgba(255,255,255,0.5);font-size:10px">${esc(v.placa)}</span>` : ''}
        </div>`,
        iconSize: [180, 30], iconAnchor: [90, 15],
      })
      const marker = L.marker([v.lat, v.lng], { icon, zIndexOffset: 5000, title: 'Clique para ver rota e histórico' })
      marker.on('click', () => selecionarCarroRef.current(v.placa, v.vendedor_nome || v.placa))
      marker.addTo(liveLayerRef.current)
    }
  }, [live, ready, ehFrota, vivos, agoraMs, carroSel, zoom])

  // Frota: só as visitas do DIA escolhido (o histórico inteiro afogava os
  // carros em ~250 pins). Supervisor: todas, como sempre.
  const visitasVisiveis = useMemo(
    () => (ehFrota ? visitas.filter((v) => v.data_visita && diaBR(v.data_visita) === data) : visitas),
    [visitas, ehFrota, data],
  )

  // Marcadores de visitas a clientes (pins)
  useEffect(() => {
    if (!mapInstance.current || !visitasLayerRef.current || !ready) return
    const L = LRef.current
    visitasLayerRef.current.clearLayers()
    if (!mostrarVisitas) return
    const fv = fmtVisita || ((iso: string) => { try { return new Date(iso).toLocaleString('pt-BR') } catch { return iso || '' } })
    const corMarcador: Record<string, string> = { presencial: '#1D4ED8', mensagem: '#059669', telefonema: '#D97706', email: '#7C3AED' }
    for (const v of visitasVisiveis) {
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
        <div style="font-size:14px;font-weight:700">${esc(v.vendedor_nome || '-')}</div>
        <div style="font-size:12px;color:#64748B">${esc(fv(v.data_visita))}</div>
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-weight:700;font-size:11px;background:${tipoCores[v.tipo]?.bg || '#F1F5F9'};color:${tipoCores[v.tipo]?.text || '#475569'};margin-top:4px">${esc(v.tipo)}</span>
        ${v.cliente_nome ? `<div style="font-size:12px;margin-top:4px;font-weight:600">${esc(v.cliente_nome)}</div>` : ''}
        ${temHandler ? `<button id="${popupId}" style="margin-top:8px;width:100%;padding:6px;border:none;border-radius:6px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;cursor:pointer">Ver detalhes</button>` : ''}
      `, { maxWidth: 260 })
      if (temHandler) {
        marker.on('popupopen', () => {
          setTimeout(() => { const btn = document.getElementById(popupId); if (btn) btn.onclick = () => onVisitaClickRef.current?.(v) }, 50)
        })
      }
      marker.addTo(visitasLayerRef.current)
    }
  }, [visitasVisiveis, ready, tipoCores, fmtVisita, mostrarVisitas, onVisitaClick])

  // Camada Propriedades (CAR): ligada e com zoom >= 11, carrega os municípios
  // cujo centro está na tela (até 4, os mais perto do centro) e desenha o
  // contorno. Propriedade com cliente vinculado fica roxa.
  useEffect(() => {
    if (!ehFrota || !ready || !mapInstance.current || !carLayerRef.current) return
    const L = LRef.current
    const camada = carLayerRef.current
    if (!mostrarCar) { camada.clearLayers(); setCarAviso(null); return }
    if (zoom < 11) { camada.clearLayers(); setCarAviso('Aproxime o mapa para ver as propriedades (CAR)'); return }
    let vivo = true
    ;(async () => {
      try {
        let lista = carMunicipios
        if (!lista) {
          if (vivo) { setCarAviso('Carregando propriedades (CAR)…'); setCarCarregando(true) }
          const r = await fetchAuth('/api/frota/mapa/propriedades')
          const d = await r.json().catch(() => ({}))
          if (!r.ok) { if (vivo) setCarAviso(d.error || 'Camada de propriedades indisponível'); return }
          lista = (d.municipios || []) as { ibge: number; nome: string; centro: [number, number] }[]
          if (vivo) setCarMunicipios(lista)
        }
        const mapa = mapInstance.current
        const area = mapa.getBounds().pad(0.6)
        const c = mapa.getCenter()
        const dist = (m: { centro: [number, number] }) => distKm({ lat: c.lat, lng: c.lng }, { lat: m.centro[0], lng: m.centro[1] })
        const alvo = (lista || [])
          .filter((m) => Array.isArray(m.centro) && area.contains([m.centro[0], m.centro[1]]))
          .sort((a, b) => dist(a) - dist(b))
          .slice(0, 4)
        if (!alvo.length) { if (vivo) { camada.clearLayers(); setCarAviso('Sem propriedades (CAR) carregadas nesta região') } return }
        const faltam = alvo.filter((m) => !carCacheRef.current.has(m.ibge))
        if (faltam.length && vivo) { setCarCarregando(true); setCarAviso(`Carregando propriedades (CAR) de ${faltam.map((m) => m.nome).join(', ')}…`) }
        // em paralelo: cada município leva alguns segundos no banco
        await Promise.all(faltam.map(async (m) => {
          const r = await fetchAuth(`/api/frota/mapa/propriedades?municipio=${m.ibge}`)
          if (r.ok) carCacheRef.current.set(m.ibge, await r.json())
        }))
        if (!vivo) return
        camada.clearLayers()
        for (const m of alvo) {
          const fc = carCacheRef.current.get(m.ibge)
          if (!fc) continue
          L.geoJSON(fc, {
            renderer: carRendererRef.current,
            style: (f: any) => (f.properties?.clientes
              ? { color: '#7c3aed', weight: 1.5, fillColor: '#7c3aed', fillOpacity: 0.18 }
              : { color: '#15803d', weight: 1, fillColor: '#15803d', fillOpacity: 0.04 }),
            onEachFeature: (f: any, layer: any) => {
              layer.options.bubblingMouseEvents = false
              layer.on('popupopen', (ev: any) => {
                const c = layer.getBounds().getCenter()
                preencherTempoLoja(ev.popup.getElement(), c.lat, c.lng)
              })
              const pr = f.properties || {}
              const ha = pr.area_ha != null ? `${Number(pr.area_ha).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : ''
              layer.bindPopup(
                `<div style="font-size:12px;font-weight:800;color:#334155">Propriedade rural (CAR) · ${esc(m.nome)}</div>` +
                (pr.clientes ? `<div style="font-size:13px;font-weight:700;color:#7c3aed;margin-top:3px">${esc(pr.clientes)}</div>` : '<div style="font-size:11.5px;color:#64748b;margin-top:3px">sem cliente vinculado</div>') +
                `<div style="font-size:12px;margin-top:3px">${[ha, pr.cultura].filter(Boolean).map(esc).join(' · ')}</div>` +
                `<div style="font-size:10px;color:#94a3b8;margin-top:3px">${esc(pr.cod_car || '')}</div>` + PLACEHOLDER_TEMPO,
                { maxWidth: 280 },
              )
            },
          }).addTo(camada)
        }
        setCarAviso(null)
      } catch {
        if (vivo) setCarAviso('Não foi possível carregar as propriedades agora')
      } finally {
        if (vivo) setCarCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [ehFrota, ready, mostrarCar, zoom, vistaTick, carMunicipios, preencherTempoLoja])

  // Histórico do carro (lista de dias salvos)
  const abrirCarro = useCallback(async (placa: string, nome: string) => {
    setCarroSel({ placa, nome })
    setPlacaSel(null); setResumo(null)
    rotaLayerRef.current?.clearLayers()
    setLoadingHist(true)
    try {
      const res = await fetchAuth(`/api/supervisor-vendas/veiculos?acao=historico&placa=${encodeURIComponent(placa)}`)
      setHistorico(res.ok ? await res.json() : [])
    } catch { setHistorico([]) }
    setLoadingHist(false)
  }, [])

  const fecharCarro = useCallback(() => {
    // cancela a rota que ainda estiver chegando (senão ela desenha depois do ✕)
    rotaReqRef.current++
    rotaAbortRef.current?.abort()
    setLoading(false); setAvisoRota(null)
    setCarroSel(null); setHistorico([]); setPlacaSel(null); setResumo(null)
    setRotaSel(null); setMotoristaDia(null)
    setData(hojeStr())
    rotaLayerRef.current?.clearLayers()
  }, [])

  // Ver rota de um carro numa data
  const verRota = useCallback(async (placa: string, dataParam: string) => {
    if (!mapInstance.current || !rotaLayerRef.current) return
    const L = LRef.current
    const reqId = ++rotaReqRef.current
    rotaAbortRef.current?.abort()
    const ctrl = new AbortController()
    rotaAbortRef.current = ctrl
    const limite = setTimeout(() => ctrl.abort(), 45_000)
    rotaLayerRef.current.clearLayers()
    setPlacaSel(dataParam)
    setData(dataParam)
    setLoading(true)
    setResumo(null)
    setRotaSel(null)
    setAvisoRota(null)
    // só o pedido mais recente pode mexer na tela
    const atual = () => reqId === rotaReqRef.current
    try {
      const res = await fetchAuth(`/api/supervisor-vendas/veiculos?acao=rota&placa=${encodeURIComponent(placa)}&data=${dataParam}`, { signal: ctrl.signal })
      if (!atual()) return
      if (!res.ok) {
        setLoading(false)
        setAvisoRota('Não foi possível carregar o trajeto agora. Tente de novo em instantes.')
        return
      }
      const rota = await res.json()
      if (!atual()) return
      // espetos de GPS fora do desenho e da timeline (o resumo/km oficial
      // continua vindo do servidor, intacto)
      const pontos = filtrarEspetos(rota.pontos || [])
      setRotaSel({ ...rota, pontos })
      setMotoristaDia(null)
      resolverMotorista?.(placa, dataParam).then((m) => { if (atual()) setMotoristaDia(m) }).catch(() => {})
      if (pontos.length === 0) {
        // Dia sem trajeto OU rota antiga já podada pela retenção (os pontos
        // crus somem depois de 90 dias, os AGREGADOS ficam) — mostra o resumo
        // salvo em vez de "0 km".
        setLoading(false)
        if (!rota.km_total) setAvisoRota(`Sem trajeto registrado em ${fmtData(dataParam)}.`)
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

      // Trajeto SEGMENTADO: buraco de sinal / salto impossível não vira linha
      // reta cruzando o mapa — vira conector pontilhado cinza com tooltip.
      const { segmentos, buracos } = segmentarTrajeto(pontos as any[])
      for (const b of buracos) {
        L.polyline([[b.de.lat, b.de.lng], [b.ate.lat, b.ate.lng]], { color: '#94a3b8', weight: 2, opacity: 0.55, dashArray: '6 8' })
          .bindTooltip(b.tooltip)
          .addTo(rotaLayerRef.current)
      }
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
          .bindPopup(`<div style="font-size:13px;font-weight:700">${esc(vis.cliente_nome || 'Visita')}</div><div style="font-size:11px;color:#64748B">${esc(vis.vendedor_nome || '')}${vis.tipo ? ` · ${esc(vis.tipo)}` : ''}</div><div style="font-size:11px;color:#059669;margin-top:2px">a ${esc(vis.dist_parada_km)} km de uma parada</div>`)
          .addTo(rotaLayerRef.current)
      }

      mapInstance.current.fitBounds(coords, { padding: [50, 50] })
      setResumo({ km: rota.km_total || 0, paradas: (rota.paradas || []).length, ini: rota.hora_inicio, fim: rota.hora_fim, dirigindo: rota.tempo_dirigindo_min || 0, visitas: (rota.visitas || []).length })
    } catch (e) {
      if (!ctrl.signal.aborted) console.error('[mapa] falha ao carregar/desenhar a rota', e)
      if (atual()) setAvisoRota(ctrl.signal.aborted
        ? 'O rastreador demorou demais para responder. Tente de novo.'
        : 'Não foi possível carregar o trajeto agora. Tente de novo em instantes.')
    } finally {
      clearTimeout(limite)
      if (atual()) setLoading(false)
    }
  }, [resolverMotorista])

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
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(255,255,255,0.97)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', width: isMobile ? 'min(190px, calc(100% - 20px))' : 240, maxHeight: isMobile ? '45%' : 'calc(100% - 20px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!carroSel ? (
          <>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: 0.3 }}>
              {ehFrota ? `FROTA · ${vivos.length} ${vivos.length === 1 ? 'CARRO' : 'CARROS'}` : tituloPainel}
              {ehFrota && vivos.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 6, fontWeight: 600, letterSpacing: 0, fontSize: 11.5, color: '#334155' }}>
                  {ORDEM_STATUS.map((s) => {
                    const n = contarPorStatus(vivos.map((v) => ({ status: statusVivo(v, agoraMs) })))[s]
                    if (!n) return null
                    return (
                      <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_INFO[s].cor }} />
                        {n} {s === 'ligado_parado' ? 'parado ligado' : STATUS_INFO[s].label.toLowerCase()}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {ehFrota ? (
                !vivosCarregados ? (
                  <div style={{ padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Buscando a posição dos carros…</div>
                ) : vivos.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Nenhum veículo ativo com rastreador</div>
                ) : vivos.map((v) => {
                  const st = statusVivo(v, agoraMs)
                  return (
                    <button key={v.placa} onClick={() => abrirCarroNoMapa(v.placa, v.nome || v.placa_exibicao)}
                      title={STATUS_INFO[st].label}
                      style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'transparent', cursor: 'pointer', display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_INFO[st].cor, flexShrink: 0, marginTop: 4 }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome || v.placa_exibicao}</span>
                        <span style={{ display: 'block', fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {v.placa_exibicao}{v.modelo ? ` · ${v.modelo}` : ''}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: st === 'sem_sinal' ? '#b91c1c' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {!v.tem_rastreador ? 'sem rastreador vinculado' : `${haQuanto(v.dt, agoraMs)}${v.local ? ` · ${v.local}` : ''}`}
                        </span>
                        {(v.os_execucao || []).map((o) => (
                          <span key={o.id} style={{ display: 'block', fontSize: 11, color: '#15803d', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.id} em execução{o.cliente ? ` · ${o.cliente}` : ''}
                          </span>
                        ))}
                      </span>
                    </button>
                  )
                })
              ) : carros.length === 0 ? (
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
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{formatarPlaca(carroSel.placa)}</div>
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
      {(locais.length > 0 || visitas.length > 0 || ehFrota) && (
        <div style={{ position: 'absolute', ...(isMobile ? { top: 10, right: 10, flexDirection: 'column', alignItems: 'flex-end' } as React.CSSProperties : { bottom: 12, right: 12 }), zIndex: 1000, display: 'flex', gap: 6 }}>
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
              {ehFrota ? `Visitas do dia (${visitasVisiveis.length})` : `Visitas (${visitas.length})`}
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
          {ehFrota && (
            <button
              onClick={() => setMostrarCar((v) => !v)}
              title={mostrarCar ? 'Ocultar o contorno das propriedades rurais' : 'Mostrar o contorno das propriedades rurais (CAR) dos municípios na tela'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: mostrarCar ? '#7c3aed' : 'rgba(255,255,255,0.97)',
                color: mostrarCar ? '#fff' : '#475569',
                boxShadow: '0 3px 10px rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: mostrarCar ? '#ddd6fe' : '#94a3b8' }} />
              {carCarregando ? 'Propriedades…' : 'Propriedades (CAR)'}
            </button>
          )}
        </div>
      )}

      {ehFrota && mostrarCar && carAviso && (
        <div style={{ position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(30,41,59,0.92)', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {carAviso}
        </div>
      )}

      {/* Legenda das cores dos carros (frota) — some quando a timeline ocupa o canto */}
      {ehFrota && !(timelineAberta && timeline.length > 0 && placaSel) && (
        <div style={{
          position: 'absolute', zIndex: 999, right: 12,
          ...(isMobile ? { bottom: 12, left: 12, flexWrap: 'wrap', justifyContent: 'center' } as React.CSSProperties : { bottom: (locais.length > 0 || visitas.length > 0) ? 56 : 12, flexDirection: 'column' } as React.CSSProperties),
          display: 'flex', gap: isMobile ? '4px 10px' : 4, background: 'rgba(255,255,255,0.97)', borderRadius: 10,
          boxShadow: '0 3px 10px rgba(0,0,0,0.2)', padding: isMobile ? '6px 10px' : '8px 12px', fontSize: 11.5, color: '#334155', fontWeight: 600,
        }}>
          {ORDEM_STATUS.map((s) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: STATUS_INFO[s].cor, border: '2px solid #fff', boxShadow: '0 0 0 1px #cbd5e1' }} />
              {STATUS_INFO[s].label}
            </span>
          ))}
          {!isMobile && atualizadoEm && (
            <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>
              atualizado às {fmtH(atualizadoEm)} · a cada 30 s
            </span>
          )}
        </div>
      )}

      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1000, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600 }}>Carregando rota...</div>
      )}

      {/* o clique num carro sempre dá uma resposta: trajeto, "sem trajeto" ou o erro */}
      {avisoRota && !loading && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1002, background: '#1E293B', color: '#fff', padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', gap: 10, alignItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', maxWidth: 'calc(100% - 24px)' }}>
          <span>{avisoRota}</span>
          <button onClick={() => setAvisoRota(null)} aria-label="Fechar aviso" style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 15, padding: 4 }}>✕</button>
        </div>
      )}

      {resumo && placaSel && (
        <div style={{ position: 'absolute', bottom: 12, ...(isMobile ? { left: 8, right: 8, flexWrap: 'wrap', justifyContent: 'center', gap: 8, padding: '8px 10px', fontSize: 12 } as React.CSSProperties : { left: '50%', transform: 'translateX(-50%)', gap: 14, padding: '8px 16px', fontSize: 13, whiteSpace: 'nowrap' } as React.CSSProperties), zIndex: 1000, background: '#1E293B', color: '#fff', borderRadius: 10, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
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
        <div style={{ position: 'absolute', top: 10, right: 10, ...(isMobile ? { left: 10, zIndex: 1001, maxHeight: 'calc(100% - 110px)' } : { zIndex: 1000, width: 292, maxHeight: 'calc(100% - 20px)' }), background: 'rgba(255,255,255,0.98)', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
