'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import {
  MapPin, Clock, Truck, ArrowRight, RefreshCw, Timer, Car, Activity, Zap, Home,
  AlertTriangle, Edit3, Check, X, ExternalLink, Navigation, ArrowDown
} from 'lucide-react'

// ── Types ──
interface OrdemServico { Id_Ordem: string; Status: string; Os_Cliente: string; Cnpj_Cliente: string; Os_Tecnico: string; Os_Tecnico2: string; Previsao_Execucao: string | null; Previsao_Faturamento: string | null; Serv_Solicitado: string; Endereco_Cliente: string; Cidade_Cliente: string; Tipo_Servico: string; Qtd_HR?: string | number | null; Servico_Oficina?: boolean; Hora_Inicio_Exec?: string; Hora_Fim_Exec?: string }
interface Tecnico { user_id: string; tecnico_nome: string; tecnico_email: string; mecanico_role: 'tecnico' | 'observador' }
interface Caminho { id: number; tecnico_nome: string; destino: string; cidade: string; motivo: string; data_saida: string; status: string }
interface AgendaRow { id: number; data: string; tecnico_nome: string; id_ordem: string | null; id_caminho: number | null; cliente: string; servico: string; endereco: string; cidade: string; endereco_opcoes: { label: string; fonte: string; endereco: string }[]; coordenadas: { lat: number; lng: number } | null; tempo_ida_min: number; distancia_ida_km: number; tempo_volta_min: number; distancia_volta_km: number; qtd_horas: number; ordem_sequencia: number; status: string; observacoes: string }
interface Veiculo { id: number; placa: string; descricao: string }
interface VinculoVeiculo { id: number; tecnico_nome: string; adesao_id: number; placa: string; descricao: string }
interface EventoGPS { tipo: string; horario: string; lat: number; lng: number; na_loja: boolean; destino_nome?: string; destino_cnpj?: string }
interface ViagemGPS { adesao_id: number; placa: string; descricao: string; data: string; saida_loja: string | null; chegada_cliente: string | null; saida_cliente: string | null; retorno_loja: string | null; eventos: EventoGPS[]; posicoes_total: number; ultima_posicao: { dt: string; lat: number; lng: number; ignicao: number; velocidade: number } | null }
interface VisitaGPS { saida: string | null; chegada: string | null; saidaCliente: string | null; retorno: string | null; almoco?: boolean; passagemRapida?: boolean; destino_nome?: string; destino_cnpj?: string; lat?: number; lng?: number; naoConfirmada?: boolean; distanciaCliente?: number; semCoordenadas?: boolean }
interface DesvioRota { visitaIdx: number; visita: VisitaGPS; permanenciaMin: number }
interface EstimadoCliente { saida: number; chegada: number; fimServico: number; retorno: number | null }

// ── Helpers ──
function normNome(n: string): string[] { return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(p => p.length > 2) }
function match(a: string, b: string) { if (!a || !b) return false; const pA = normNome(a), pB = normNome(b); if (!pA.length || !pB.length || pA[0] !== pB[0]) return false; if (pA.length === 1 || pB.length === 1) return true; const s = new Set(pA.slice(1)); return pB.slice(1).some(p => s.has(p)) }
function extrairSolicitacao(s: string): string { if (!s) return ''; const i = s.indexOf('Solicitação do cliente:'); if (i === -1) return ''; const a = s.substring(i + 'Solicitação do cliente:'.length); const f = a.indexOf('Serviço Realizado'); return (f > -1 ? a.substring(0, f) : a).replace(/\n/g, ' ').trim() }
function fm(m: number) { if (m < 60) return `${Math.round(m)}min`; const h = Math.floor(m / 60); const r = Math.round(m % 60); return r > 0 ? `${h}h${r}` : `${h}h` }
function fh(m: number) { const clamped = Math.min(m, 1439); return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(Math.round(clamped % 60)).padStart(2, '0')}` }
function fHora(iso: string | null): string { if (!iso) return '--:--'; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
function isoToMin(iso: string): number { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes() }
function agora(): number { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
function fimExecucaoReal(ord: { Previsao_Execucao: string | null; Qtd_HR?: string | number | null }): string {
  if (!ord.Previsao_Execucao) return ''
  const h = parseFloat(String(ord.Qtd_HR || 0)) || 0
  const dias = h <= 0 ? 1 : Math.max(1, Math.ceil(h / 8))
  if (dias <= 1) return ord.Previsao_Execucao
  const d = new Date(ord.Previsao_Execucao + 'T12:00:00')
  d.setDate(d.getDate() + dias - 1)
  return d.toISOString().split('T')[0]
}

// Distância simples entre dois pontos (Haversine, km)
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Endereço da oficina (Nova Tratores)
const ENDERECO_OFICINA = 'AV SÃO SEBASTIÃO, PIRAJU (SP)'

// Detecta se endereço é da oficina (Nova Tratores)
function isEnderecoOficina(endereco: string, cliente: string, servicoOficina?: boolean): boolean {
  if (servicoOficina) return true
  const low = (endereco + ' ' + cliente).toLowerCase()
  return low.includes('nova tratores') || low.includes('piraju') && low.includes('comercio de maquinas')
}

function isHorarioAlmoco(iso: string | null): boolean {
  if (!iso) return false
  const m = isoToMin(iso)
  return m >= 660 && m < 780 // 11:00 até 13:00
}

function agruparVisitasGPS(eventos: EventoGPS[]): VisitaGPS[] {
  // Filtrar retornos falsos: retorno_loja seguido de saida_loja em < 5 min = trânsito, não retorno real
  const relevantes = eventos.filter(ev => ev.tipo !== 'parada' && ev.tipo !== 'inicio_movimento')
  const limpos: EventoGPS[] = []
  for (let i = 0; i < relevantes.length; i++) {
    const ev = relevantes[i]
    if (ev.tipo === 'retorno_loja') {
      const prox = relevantes[i + 1]
      if (prox && prox.tipo === 'saida_loja') {
        const diff = isoToMin(prox.horario) - isoToMin(ev.horario)
        if (diff >= 0 && diff < 5) {
          // Retorno falso + saída falsa = trânsito entre clientes, pula os dois
          i++ // pula o saida_loja seguinte
          continue
        }
      }
    }
    limpos.push(ev)
  }

  const v: VisitaGPS[] = []; let c: VisitaGPS = { saida: null, chegada: null, saidaCliente: null, retorno: null }; let has = false
  for (const ev of limpos) {
    if (ev.tipo === 'saida_loja') { if (has) { v.push({ ...c }); c = { saida: null, chegada: null, saidaCliente: null, retorno: null } }; c.saida = ev.horario; has = true }
    else if (ev.tipo === 'chegada_cliente') {
      if (c.saidaCliente) { v.push({ ...c }); c = { saida: c.saidaCliente, chegada: ev.horario, saidaCliente: null, retorno: null, destino_nome: ev.destino_nome, destino_cnpj: ev.destino_cnpj, lat: ev.lat, lng: ev.lng } }
      else { c.chegada = ev.horario; c.destino_nome = ev.destino_nome; c.destino_cnpj = ev.destino_cnpj; c.lat = ev.lat; c.lng = ev.lng }
      has = true
    }
    else if (ev.tipo === 'saida_cliente') { c.saidaCliente = ev.horario; has = true }
    else if (ev.tipo === 'retorno_loja') { c.retorno = ev.horario; v.push({ ...c }); c = { saida: null, chegada: null, saidaCliente: null, retorno: null }; has = false }
  }
  if (has) v.push(c)
  // Marca visitas no horário de almoço (11:00-13:00) e passagens rápidas (< 10 min no cliente)
  return v.map(vis => {
    if (isHorarioAlmoco(vis.chegada) && (!vis.saidaCliente || isHorarioAlmoco(vis.saidaCliente))) {
      return { ...vis, almoco: true }
    }
    // Passagem rápida: chegou e saiu do cliente em menos de 10 minutos — não é serviço real
    if (vis.chegada && vis.saidaCliente) {
      const diff = isoToMin(vis.saidaCliente) - isoToMin(vis.chegada)
      if (diff >= 0 && diff < 10) return { ...vis, passagemRapida: true }
    }
    return vis
  })
}

const S = 510, AI = 660, AD = 90
function estimativasPorCliente(items: AgendaRow[]): EstimadoCliente[] {
  const r: EstimadoCliente[] = []; let cur = S; let al = false
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const ida = it.tempo_ida_min || 0; const sv = (it.qtd_horas || 2) * 60
    const saida = cur; cur += ida; const chegada = cur
    if (!al && cur >= AI && cur < AI + 120) { cur += AD; al = true }
    cur += sv; const fim = cur
    if (!al && cur >= AI && cur < AI + 120) { cur += AD; al = true }
    let ret: number | null = null
    if (i === items.length - 1) { cur += (it.tempo_volta_min || 0); ret = cur }
    r.push({ saida, chegada, fimServico: fim, retorno: ret })
  }; return r
}

// Encontra a visita GPS mais próxima do endereço do cliente (coordenadas da agenda)
// Sem coordenadas = fallback cronológico (marcado como não confirmado)
function matchVisitaGPS(reais: VisitaGPS[], item: AgendaRow, _ordsTec: OrdemServico[], usados: Set<number>): VisitaGPS | undefined {
  const coordAgenda = item.coordenadas

  if (coordAgenda) {
    let melhorIdx = -1, melhorDist = Infinity
    for (let j = 0; j < reais.length; j++) {
      if (usados.has(j)) continue
      const v = reais[j]
      if (v.lat != null && v.lng != null) {
        const dist = distanciaKm(coordAgenda.lat, coordAgenda.lng, v.lat, v.lng)
        if (dist < melhorDist) { melhorDist = dist; melhorIdx = j }
      }
    }
    if (melhorIdx >= 0 && melhorDist <= 20) {
      const vis = reais[melhorIdx]
      vis.distanciaCliente = melhorDist
      vis.naoConfirmada = melhorDist > 5
      usados.add(melhorIdx)
      return vis
    }
  }

  // Fallback cronológico quando não tem coordenadas — pega próxima visita não usada
  // Marca como não confirmada para o usuário saber que não foi validado por GPS
  for (let j = 0; j < reais.length; j++) {
    if (usados.has(j)) continue
    const vis = reais[j]
    vis.naoConfirmada = true
    vis.semCoordenadas = true
    usados.add(j)
    return vis
  }
  return undefined
}

// Ajusta estimativas com tempos reais do GPS — usa cursor progressivo + match por destino
function estimativasHibridas(estimados: EstimadoCliente[], reais: VisitaGPS[], items: AgendaRow[], ordsTec?: OrdemServico[]): EstimadoCliente[] {
  if (estimados.length === 0) return estimados
  const aj: EstimadoCliente[] = []
  let cursor = S
  let almocoContado = false
  const usados = new Set<number>()

  for (let i = 0; i < estimados.length; i++) {
    // Match inteligente: por destino/CNPJ, não por índice
    const gps = ordsTec ? matchVisitaGPS(reais, items[i], ordsTec, usados) : reais[i]
    const ida = items[i]?.tempo_ida_min || 0
    const sv = (items[i]?.qtd_horas || 2) * 60
    const volta = items[i]?.tempo_volta_min || 0

    // 1. Saída: hora real do GPS ou cursor atual
    const saida = gps?.saida ? isoToMin(gps.saida) : cursor
    cursor = saida

    // 2. Chegada: hora real do GPS ou saída + tempo de ida
    const chegada = gps?.chegada ? isoToMin(gps.chegada) : cursor + ida
    cursor = chegada

    // Almoço: se passou das 11h e não contou ainda, adiciona 90 min
    if (!almocoContado && cursor >= AI && cursor < AI + 120) { cursor += AD; almocoContado = true }

    // 3. Fim do serviço: hora real que saiu do cliente, ou chegada + horas de serviço
    const fimServico = gps?.saidaCliente ? isoToMin(gps.saidaCliente) : cursor + sv
    cursor = fimServico

    if (!almocoContado && cursor >= AI && cursor < AI + 120) { cursor += AD; almocoContado = true }

    // 4. Retorno: só no último item
    let retorno: number | null = null
    if (i === estimados.length - 1) {
      if (gps?.retorno) { retorno = isoToMin(gps.retorno) }
      else { retorno = cursor + volta }
      cursor = retorno
    }

    aj.push({ saida, chegada, fimServico, retorno })
  }
  return aj
}

function visitasReais(visitas: VisitaGPS[]): VisitaGPS[] { return visitas.filter(v => !v.almoco && !v.passagemRapida) }

function osAtualIdx(visitasGPS: VisitaGPS[], estimados: EstimadoCliente[], totalOS: number): number {
  const reais = visitasReais(visitasGPS)
  const concluidos = reais.filter(v => v.saidaCliente).length
  const emCliente = reais.findIndex(v => v.chegada && !v.saidaCliente)
  if (emCliente >= 0) return emCliente
  if (concluidos < totalOS) return concluidos
  if (reais.length === 0 && estimados.length > 0) {
    const now = agora()
    for (let i = 0; i < estimados.length; i++) { if (now < estimados[i].fimServico) return i }
    return estimados.length - 1
  }
  return Math.min(concluidos, totalOS - 1)
}

// Reverse geocode
const geoCache: Record<string, string> = {}
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  if (geoCache[key]) return geoCache[key]
  try {
    const r = await fetch(`/api/pos/geocode?lat=${lat}&lng=${lng}`)
    if (!r.ok) return ''
    const { endereco } = await r.json()
    if (endereco) geoCache[key] = endereco
    return endereco || ''
  } catch { return '' }
}

const EVENTO_LABEL: Record<string, string> = {
  saida_loja: 'Saiu da oficina', chegada_cliente: 'Chegou no cliente',
  saida_cliente: 'Saiu do cliente', retorno_loja: 'Retornou à oficina',
}

const CSS = `
@keyframes vg-blink { 0%,100% { opacity:1; } 50% { opacity:.3; } }
@keyframes vg-fade-in { from { opacity:0 } to { opacity:1 } }
@keyframes vg-slide-up { from { opacity:0; transform:translateY(20px) scale(.98) } to { opacity:1; transform:translateY(0) scale(1) } }
@keyframes vg-card-drop {
  0% { opacity:0; transform: translateY(-30px) rotate(-2deg) scale(.9); }
  60% { opacity:1; transform: translateY(6px) rotate(.5deg) scale(1.02); }
  80% { transform: translateY(-2px) rotate(-.3deg) scale(.99); }
  100% { opacity:1; transform: translateY(0) rotate(0) scale(1); }
}
@keyframes vg-shine { 0% { left:-80% } 100% { left:120% } }
@keyframes vg-pulse-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(0,0,0,.1) } 50% { box-shadow: 0 0 0 8px rgba(0,0,0,0) } }
@keyframes vg-mov-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.4) } 50% { box-shadow: 0 0 0 6px rgba(34,197,94,0) } }
@keyframes vg-mov-blink { 0%,100% { opacity:1 } 50% { opacity:.4 } }
.vg-car-moving { animation: vg-mov-pulse 1.5s ease infinite; }
.vg-car-blink { animation: vg-mov-blink 1.2s ease-in-out infinite; }
.vg-figurinha {
  cursor:pointer; animation: vg-card-drop .5s cubic-bezier(.22,.68,.36,1.2) both;
  transition: transform .2s cubic-bezier(.22,.68,.36,1.2), box-shadow .2s;
}
.vg-figurinha:hover { transform: translateY(-6px) scale(1.03) rotate(-.5deg); box-shadow: 0 16px 40px rgba(0,0,0,.15) !important; z-index:5; }
.vg-pulse-glow { animation: vg-pulse-glow 2s ease infinite; }
.vg-fora { animation: vg-blink 1.5s ease-in-out infinite; }
.vg-edit-input:focus { border-color: #111 !important; }
.vg-modal-overlay { animation: vg-fade-in .15s ease-out; }
.vg-modal-body { animation: vg-slide-up .25s cubic-bezier(.4,0,.2,1); }
.vg-os-section { transition: background .15s; }
.vg-os-section:hover { background: #F8F8F8 !important; }
.vg-timeline-dot { transition: transform .15s; }
.vg-timeline-dot:hover { transform: scale(1.5); }
.vg-btn { transition: all .1s; }
.vg-btn:hover { opacity:.85; transform: scale(1.02); }
`

// ── Component ──
export default function BlocoVisaoGeral({ tecnicos, ordens, caminhos }: { tecnicos: Tecnico[]; ordens: OrdemServico[]; caminhos: Caminho[] }) {
  const [agenda, setAgenda] = useState<AgendaRow[]>([])
  const [syncing, setSyncing] = useState(false)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [vinculos, setVinculos] = useState<VinculoVeiculo[]>([])
  const [viagensPorTec, setViagensPorTec] = useState<Record<string, ViagemGPS>>({})
  const [gpsLoading, setGpsLoading] = useState(false)
  const [editingAddr, setEditingAddr] = useState<{ id: number; value: string } | null>(null)
  const [savingAddr, setSavingAddr] = useState(false)
  const [modalTec, setModalTec] = useState<string | null>(null)
  const [carAddr, setCarAddr] = useState<Record<string, string>>({})
  const [eventAddrs, setEventAddrs] = useState<Record<string, string>>({})
  const [addrMismatch, setAddrMismatch] = useState<Record<string, { osId: string; agendaId: number; gpsAddr: string; isOficina: boolean }>>({})
  const autoUpdatedRef = useRef<Set<string>>(new Set())
  const reorderAppliedRef = useRef<Set<string>>(new Set())
  const [resumoTec, setResumoTec] = useState('')
  const [savingResumo, setSavingResumo] = useState(false)
  const resumoLoadedRef = useRef<string | null>(null)
  const [dataHistorico, setDataHistorico] = useState('')
  const [agendaHistorico, setAgendaHistorico] = useState<AgendaRow[] | null>(null)
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [editOficina, setEditOficina] = useState<{ tecnico: string; texto: string } | null>(null)
  const [savingOficina, setSavingOficina] = useState(false)
  const [atividadeOficina, setAtividadeOficina] = useState<Record<string, string>>({})
  const [desviosConfirmados, setDesviosConfirmados] = useState<Record<string, 'cliente' | 'desvio'>>({})

  const tecs = useMemo(() => tecnicos.filter(t => t.mecanico_role === 'tecnico'), [tecnicos])
  const hoje = useMemo(() => new Date().toISOString().split('T')[0], [])

  // ── API ──
  const calcRota = useCallback(async (row: AgendaRow) => {
    try { const r = await fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, calcular: true }) }); if (r.ok) { const u = await r.json(); setAgenda(p => p.map(a => a.id === row.id ? u : a)) } } catch { }
  }, [])
  const carregar = useCallback(async () => { const r = await fetch(`/api/pos/agenda-visao?data=${hoje}`); if (r.ok) { const rows = await r.json() as AgendaRow[]; setAgenda(rows); rows.filter(r => r.endereco && !r.coordenadas).forEach(r => calcRota(r)); return rows }; return [] }, [hoje, calcRota])

  const tecsRef = useRef(tecs); const ordensRef = useRef(ordens); tecsRef.current = tecs; ordensRef.current = ordens
  const sincronizar = useCallback(async () => {
    const t = tecsRef.current, o = ordensRef.current; if (!t.length) return; setSyncing(true)
    try {
      const hojeStr = new Date().toISOString().split('T')[0]
      const payload = t.map(tec => ({ nome: tec.tecnico_nome, ordens: o.filter(ord => {
        if (ord.Status !== 'Execução' || !match(tec.tecnico_nome, ord.Os_Tecnico)) return false
        // Em execução sempre aparece hoje; se tem data, verifica range
        if (!ord.Previsao_Execucao) return true
        const inicio = ord.Previsao_Execucao
        const fim = fimExecucaoReal(ord)
        return hojeStr >= inicio && hojeStr <= fim
      }).map(ord => ({ id: ord.Id_Ordem, cliente: ord.Os_Cliente, cnpj: ord.Cnpj_Cliente, endereco: ord.Endereco_Cliente, cidade: ord.Cidade_Cliente, servico: ord.Serv_Solicitado, qtdHoras: parseFloat(String(ord.Qtd_HR || 0)) || 2, horaInicio: ord.Hora_Inicio_Exec || '', horaFim: ord.Hora_Fim_Exec || '', observacoes: extrairSolicitacao(ord.Serv_Solicitado || '') })) }))
      if (payload.length > 0) { const r = await fetch('/api/pos/agenda-visao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: hoje, tecnicos: payload }) }); if (r.ok) { const rows = await r.json() as AgendaRow[]; setAgenda(rows); rows.filter(r => r.endereco && (r.tempo_ida_min === 0 || !r.coordenadas)).forEach(r => calcRota(r)) } } else { await carregar() }
    } finally { setSyncing(false) }
  }, [hoje, carregar, calcRota])

  const carregarVeiculos = useCallback(async () => { try { const r = await fetch('/api/pos/rastreamento?acao=veiculos'); if (r.ok) setVeiculos(await r.json()) } catch { } }, [])
  const carregarVinculos = useCallback(async () => { const { data } = await supabase.from('tecnico_veiculos').select('*'); if (data) setVinculos(data as VinculoVeiculo[]) }, [])
  const carregarGPS = useCallback(async (vincs: VinculoVeiculo[]) => {
    if (vincs.length === 0) return; setGpsLoading(true)
    const map: Record<string, ViagemGPS> = {}
    for (const v of vincs) { try { const r = await fetch(`/api/pos/rastreamento?acao=viagens&adesao_id=${v.adesao_id}`); if (r.ok) { const viagens: ViagemGPS[] = await r.json(); const h = viagens.find(vi => vi.data === hoje); if (h) map[v.tecnico_nome] = h } } catch { } }
    setViagensPorTec(map); setGpsLoading(false)
    // Reverse geocode car positions + event locations
    for (const [nome, viagem] of Object.entries(map)) {
      if (viagem.ultima_posicao) {
        reverseGeocode(viagem.ultima_posicao.lat, viagem.ultima_posicao.lng).then(addr => {
          if (addr) setCarAddr(p => ({ ...p, [nome]: addr }))
        })
      }
      // Reverse geocode all events
      let ci = 0, si = 0, li = 0
      viagem.eventos.filter(ev => ev.tipo === 'chegada_cliente' || ev.tipo === 'saida_cliente' || ev.tipo === 'saida_loja' || ev.tipo === 'retorno_loja').forEach(ev => {
        if (ev.tipo === 'chegada_cliente') {
          const key = `${nome}_cheg_${ci}`; ci++
          reverseGeocode(ev.lat, ev.lng).then(addr => { if (addr) setEventAddrs(p => ({ ...p, [key]: addr })) })
        } else if (ev.tipo === 'saida_cliente') {
          const key = `${nome}_said_${si}`; si++
          reverseGeocode(ev.lat, ev.lng).then(addr => { if (addr) setEventAddrs(p => ({ ...p, [key]: addr })) })
        } else {
          const key = `${nome}_loja_${li}`; li++
          reverseGeocode(ev.lat, ev.lng).then(addr => { if (addr) setEventAddrs(p => ({ ...p, [key]: addr })) })
        }
      })
    }
  }, [hoje])

  const vincularVeiculo = useCallback(async (tecNome: string, adesaoId: number) => {
    const vei = veiculos.find(v => v.id === adesaoId); if (!vei) return
    const { data: ex } = await supabase.from('tecnico_veiculos').select('id').eq('tecnico_nome', tecNome).single()
    if (ex) await supabase.from('tecnico_veiculos').update({ adesao_id: adesaoId, placa: vei.placa, descricao: vei.descricao }).eq('id', ex.id)
    else await supabase.from('tecnico_veiculos').insert({ tecnico_nome: tecNome, adesao_id: adesaoId, placa: vei.placa, descricao: vei.descricao })
    await carregarVinculos()
    try { const r = await fetch(`/api/pos/rastreamento?acao=viagens&adesao_id=${adesaoId}`); if (r.ok) { const vs: ViagemGPS[] = await r.json(); const h = vs.find(v => v.data === hoje); if (h) { setViagensPorTec(p => ({ ...p, [tecNome]: h })); if (h.ultima_posicao) reverseGeocode(h.ultima_posicao.lat, h.ultima_posicao.lng).then(a => { if (a) setCarAddr(p => ({ ...p, [tecNome]: a })) }) } else setViagensPorTec(p => { const n = { ...p }; delete n[tecNome]; return n }) } } catch { }
  }, [veiculos, hoje, carregarVinculos])
  const desvincularVeiculo = useCallback(async (tecNome: string) => { await supabase.from('tecnico_veiculos').delete().eq('tecnico_nome', tecNome); await carregarVinculos(); setViagensPorTec(p => { const n = { ...p }; delete n[tecNome]; return n }) }, [carregarVinculos])

  const salvarEndereco = useCallback(async () => {
    if (!editingAddr) return; setSavingAddr(true)
    try { const r = await fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingAddr.id, endereco: editingAddr.value }) }); if (r.ok) { const u = await r.json(); setAgenda(p => p.map(a => a.id === editingAddr.id ? u : a)) } } catch { }
    setSavingAddr(false); setEditingAddr(null)
  }, [editingAddr])

  const autoUpdateAddr = useCallback(async (agendaId: number, newAddr: string) => {
    const key = `${agendaId}`
    if (autoUpdatedRef.current.has(key)) return
    autoUpdatedRef.current.add(key)
    try { const r = await fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: agendaId, endereco: newAddr }) }); if (r.ok) { const u = await r.json(); setAgenda(p => p.map(a => a.id === agendaId ? u : a)) } } catch { }
  }, [])

  const aplicarEnderecoGPS = useCallback(async (agendaId: number, gpsAddr: string, tecNome: string) => {
    try { const r = await fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: agendaId, endereco: gpsAddr }) }); if (r.ok) { const u = await r.json(); setAgenda(p => p.map(a => a.id === agendaId ? u : a)) } } catch { }
    setAddrMismatch(p => { const n = { ...p }; delete n[tecNome]; return n })
  }, [])

  useEffect(() => {
    if (!tecs.length || !ordens.length) return
    sincronizar(); carregarVeiculos()
    carregarVinculos().then(async () => { const { data } = await supabase.from('tecnico_veiculos').select('*'); if (data && data.length > 0) carregarGPS(data as VinculoVeiculo[]) })
  }, [tecs.length, ordens.length, sincronizar, carregarVeiculos, carregarVinculos, carregarGPS])

  // ── Auto-reorder agenda by GPS visit order ──
  useEffect(() => {
    if (Object.keys(viagensPorTec).length === 0 || agenda.length === 0) return

    for (const tec of tecs) {
      const nome = tec.tecnico_nome
      const viagem = viagensPorTec[nome]
      if (!viagem) continue

      const items = agenda.filter(a => a.tecnico_nome === nome).sort((a, b) => a.ordem_sequencia - b.ordem_sequencia)
      const ordsTec = ordens.filter(o => o.Status === 'Execução' && (match(nome, o.Os_Tecnico) || match(nome, o.Os_Tecnico2)))
      const ext = items.filter(a => {
        const os = a.id_ordem ? ordsTec.find(o => o.Id_Ordem === a.id_ordem) : null
        if (os?.Servico_Oficina) return false
        return !(a.cliente || '').toLowerCase().includes('nova tratores')
      })
      if (ext.length < 2) continue

      const visitasGPS = agruparVisitasGPS(viagem.eventos)
      const reais = visitasReais(visitasGPS)
      if (reais.length < 1) continue

      // Pega a primeira visita GPS real com chegada
      const primeiraVisita = reais.find(v => v.chegada)
      if (!primeiraVisita) continue

      // Acha qual item da agenda corresponde a essa visita GPS
      let matchedIdx = -1
      // Coordenadas da chegada GPS
      const evChegada = viagem.eventos.find(e => e.tipo === 'chegada_cliente' && e.horario === primeiraVisita.chegada)
      for (let ai = 0; ai < ext.length; ai++) {
        const item = ext[ai]
        const os = item.id_ordem ? ordsTec.find(o => o.Id_Ordem === item.id_ordem) : null
        const cnpjOS = os?.Cnpj_Cliente || ''
        // 1. Match por CNPJ
        if (cnpjOS && primeiraVisita.destino_cnpj && cnpjOS === primeiraVisita.destino_cnpj) { matchedIdx = ai; break }
        // 2. Match por nome destino vs cliente
        if (primeiraVisita.destino_nome && item.cliente && match(primeiraVisita.destino_nome, item.cliente)) { matchedIdx = ai; break }
        // 3. Match por cidade
        const cidadeGPS = (primeiraVisita.destino_nome || '').toLowerCase()
        const cidadeAgenda = (item.cidade || os?.Cidade_Cliente || '').toLowerCase()
        if (cidadeAgenda && cidadeGPS && (cidadeGPS.includes(cidadeAgenda) || cidadeAgenda.includes(cidadeGPS))) { matchedIdx = ai; break }
      }
      // 4. Fallback: match por proximidade GPS vs coordenadas da agenda
      if (matchedIdx < 0 && evChegada) {
        let melhorDist = Infinity
        for (let ai = 0; ai < ext.length; ai++) {
          const coord = ext[ai].coordenadas
          if (!coord) continue
          const dist = distanciaKm(evChegada.lat, evChegada.lng, coord.lat, coord.lng)
          if (dist < melhorDist && dist < 5) { melhorDist = dist; matchedIdx = ai }
        }
      }

      // Se a primeira visita GPS NÃO é o primeiro item da agenda → precisa trocar
      if (matchedIdx <= 0) continue // já é o primeiro ou não deu match

      const reorderKey = `${nome}_${ext[matchedIdx].id}_to_first`
      if (reorderAppliedRef.current.has(reorderKey)) continue
      reorderAppliedRef.current.add(reorderKey)

      // Troca: o item que o GPS visitou primeiro recebe a menor sequencia,
      // e os outros sobem
      const seqs = ext.map(e => e.ordem_sequencia).sort((a, b) => a - b)
      const novaOrdem = [...ext]
      // Move o matched para a posição 0, empurra os demais
      const matched = novaOrdem.splice(matchedIdx, 1)[0]
      novaOrdem.unshift(matched)

      const updates: { id: number; ordem_sequencia: number }[] = []
      for (let i = 0; i < novaOrdem.length; i++) {
        if (novaOrdem[i].ordem_sequencia !== seqs[i]) {
          updates.push({ id: novaOrdem[i].id, ordem_sequencia: seqs[i] })
        }
      }

      if (updates.length === 0) continue

      ;(async () => {
        // 1. Atualiza ordem_sequencia
        for (const upd of updates) {
          try {
            const r = await fetch('/api/pos/agenda-visao', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: upd.id, ordem_sequencia: upd.ordem_sequencia })
            })
            if (r.ok) {
              const updated = await r.json()
              setAgenda(p => p.map(a => a.id === upd.id ? updated : a))
            }
          } catch { }
        }
        // 2. Recalcula rotas na nova ordem: cada item usa as coordenadas do anterior como origem
        for (let i = 1; i < novaOrdem.length; i++) {
          const anterior = novaOrdem[i - 1]
          const atual = novaOrdem[i]
          if (anterior.coordenadas && atual.endereco) {
            try {
              const r = await fetch('/api/pos/agenda-visao', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: atual.id,
                  calcular: true,
                  origemLat: anterior.coordenadas.lat,
                  origemLng: anterior.coordenadas.lng
                })
              })
              if (r.ok) {
                const updated = await r.json()
                setAgenda(p => p.map(a => a.id === atual.id ? updated : a))
              }
            } catch { }
          }
        }
      })()
    }
  }, [viagensPorTec, agenda, tecs, ordens])

  // ── Computed ──
  const porTec = useMemo(() => { const m: Record<string, AgendaRow[]> = {}; tecs.forEach(t => { m[t.tecnico_nome] = agenda.filter(a => a.tecnico_nome === t.tecnico_nome).sort((a, b) => a.ordem_sequencia - b.ordem_sequencia) }); return m }, [tecs, agenda])
  const camPorTec = useMemo(() => { const m: Record<string, Caminho | null> = {}; tecs.forEach(t => { m[t.tecnico_nome] = caminhos.find(c => c.tecnico_nome === t.tecnico_nome && c.status === 'em_transito') || null }); return m }, [tecs, caminhos])
  const oficina = (items: AgendaRow[], ordsTec: OrdemServico[]) => {
    if (items.length === 0) return true
    return items.every(a => {
      const os = a.id_ordem ? ordsTec.find(o => o.Id_Ordem === a.id_ordem) : null
      if (os?.Servico_Oficina) return true
      return (a.cliente || '').toLowerCase().includes('nova tratores')
    })
  }
  const ordensPorTec = useMemo(() => { const m: Record<string, OrdemServico[]> = {}; tecs.forEach(t => { m[t.tecnico_nome] = ordens.filter(o => o.Status === 'Execução' && (match(t.tecnico_nome, o.Os_Tecnico) || match(t.tecnico_nome, o.Os_Tecnico2))) }); return m }, [tecs, ordens])
  const vinculoPorTec = useMemo(() => { const m: Record<string, VinculoVeiculo | null> = {}; tecs.forEach(t => { m[t.tecnico_nome] = vinculos.find(v => v.tecnico_nome === t.tecnico_nome) || null }); return m }, [tecs, vinculos])
  const veiculosVinculados = useMemo(() => new Set(vinculos.map(v => v.adesao_id)), [vinculos])

  const tecsSorted = useMemo(() => {
    return [...tecs].sort((a, b) => {
      const oa = (ordensPorTec[a.tecnico_nome] || []).length
      const ob = (ordensPorTec[b.tecnico_nome] || []).length
      if (ob !== oa) return ob - oa
      const va = viagensPorTec[a.tecnico_nome] ? 1 : 0
      const vb = viagensPorTec[b.tecnico_nome] ? 1 : 0
      return vb - va
    })
  }, [tecs, ordensPorTec, viagensPorTec])

  const cardData = useMemo(() => {
    return tecsSorted.map(tec => {
      const items = porTec[tec.tecnico_nome] || []
      const cam = camPorTec[tec.tecnico_nome]
      // Ordena OS pela ordem_sequencia da agenda (respeita reorder GPS)
      const ordsTec = [...(ordensPorTec[tec.tecnico_nome] || [])].sort((a, b) => {
        const agA = items.find(it => it.id_ordem === a.Id_Ordem)
        const agB = items.find(it => it.id_ordem === b.Id_Ordem)
        return (agA?.ordem_sequencia ?? 999) - (agB?.ordem_sequencia ?? 999)
      })
      const naOfi = !cam && oficina(items, ordsTec)
      const ext = items.filter(a => {
        const os = a.id_ordem ? ordsTec.find(o => o.Id_Ordem === a.id_ordem) : null
        if (os?.Servico_Oficina) return false
        return !(a.cliente || '').toLowerCase().includes('nova tratores')
      })
      const vinculo = vinculoPorTec[tec.tecnico_nome]
      const viagem = viagensPorTec[tec.tecnico_nome] || null
      const visitasGPS = viagem ? agruparVisitasGPS(viagem.eventos) : []
      const estimadosPuros = ext.length > 0 && ext.every(a => a.tempo_ida_min > 0) ? estimativasPorCliente(ext) : []
      const reaisParaHibrido = visitasReais(visitasGPS)
      const estimados = estimadosPuros.length > 0 ? estimativasHibridas(estimadosPuros, reaisParaHibrido, ext, ordsTec) : []
      const lastEst = estimados.length > 0 ? estimados[estimados.length - 1] : null
      // Usa a última visita agrupada para determinar se está fora da loja (não o campo top-level)
      const ultimaVisita = visitasGPS.length > 0 ? visitasGPS[visitasGPS.length - 1] : null
      const foraLoja = !!(ultimaVisita && ultimaVisita.saida && !ultimaVisita.retorno)
      const completedVisits = visitasReais(visitasGPS).filter(v => v.saidaCliente).length
      const pos = viagem?.ultima_posicao || null
      const reais = visitasReais(visitasGPS)
      const visitaIdx = ordsTec.length > 0 ? osAtualIdx(visitasGPS, estimados, ordsTec.length) : -1

      // Mapeia a visita GPS atual para o OS correto — por coordenadas
      const visitaAtual = visitaIdx >= 0 ? reais[visitaIdx] : null
      let curIdx = visitaIdx
      if (visitaAtual && visitaAtual.lat != null && visitaAtual.lng != null && ext.length > 0) {
        // Acha qual item da agenda está mais perto das coordenadas GPS da visita atual
        let melhorDist = Infinity, melhorEi = -1
        for (let ei = 0; ei < ext.length; ei++) {
          const coord = ext[ei].coordenadas
          if (!coord) continue
          const dist = distanciaKm(visitaAtual.lat!, visitaAtual.lng!, coord.lat, coord.lng)
          if (dist < melhorDist) { melhorDist = dist; melhorEi = ei }
        }
        if (melhorEi >= 0 && melhorDist < 15) {
          const oi = ordsTec.findIndex(o => o.Id_Ordem === ext[melhorEi].id_ordem)
          if (oi >= 0) curIdx = oi
        }
      }

      // Se está a caminho, detecta destino pelo mais próximo da posição atual
      if (pos && foraLoja && ext.length > 1) {
        let melhorIdx = curIdx, melhorDist = Infinity
        for (let ei = 0; ei < ext.length; ei++) {
          const coord = ext[ei].coordenadas
          if (!coord) continue
          const dist = distanciaKm(pos.lat, pos.lng, coord.lat, coord.lng)
          if (dist < melhorDist) {
            melhorDist = dist
            const osMatch = ordsTec.findIndex(o => o.Id_Ordem === ext[ei].id_ordem)
            if (osMatch >= 0) melhorIdx = osMatch
          }
        }
        if (melhorIdx !== curIdx) curIdx = melhorIdx
      }

      const curOS = curIdx >= 0 ? ordsTec[curIdx] : null
      const curAgItem = curOS ? items.find(a => a.id_ordem === curOS.Id_Ordem) : null
      const curEst = curIdx >= 0 ? estimados[curIdx] : null
      // curGPS: busca a visita que corresponde ao curOS (por destino), não por índice
      let curGPS: VisitaGPS | null = null
      if (curOS && curAgItem) {
        const _u = new Set<number>()
        curGPS = matchVisitaGPS(reais, curAgItem, ordsTec, _u) || null
      } else if (visitaIdx >= 0) {
        curGPS = reais[visitaIdx] || null
      }

      let status: 'oficina' | 'caminho' | 'cliente' | 'retornando' | 'retornou' = 'oficina'
      // Usa última visita para status — se saiu de novo após retorno, não marca como "retornou"
      if (ultimaVisita?.retorno) status = 'retornou'
      else if (curGPS?.chegada && !curGPS?.saidaCliente) status = 'cliente'
      else if (foraLoja) status = 'caminho'
      else if (curGPS?.saidaCliente && curIdx === ordsTec.length - 1) status = 'retornando'

      let cardEndereco = ''
      if (status === 'cliente' || status === 'caminho') {
        cardEndereco = curAgItem?.endereco || curOS?.Endereco_Cliente || ''
      }
      if (!cardEndereco && carAddr[tec.tecnico_nome] && foraLoja) {
        cardEndereco = carAddr[tec.tecnico_nome]
      }

      // Multi-dia: calcula "Dia X/Y" se a OS tem período > 1 dia
      let multiDia = ''
      if (curOS?.Previsao_Execucao && curOS?.Previsao_Faturamento && curOS.Previsao_Faturamento > curOS.Previsao_Execucao) {
        const inicio = new Date(curOS.Previsao_Execucao + 'T00:00:00')
        const fim = new Date(curOS.Previsao_Faturamento + 'T00:00:00')
        const totalDias = Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
        const diaAtual = Math.max(1, Math.min(totalDias, Math.round((hoje.getTime() - inicio.getTime()) / 86400000) + 1))
        multiDia = `Dia ${diaAtual}/${totalDias}`
      }

      let previsaoLabel = ''
      let previsaoHora = ''
      if (status === 'caminho' && curEst) { previsaoLabel = 'Chega'; previsaoHora = fh(curEst.chegada) }
      else if (status === 'cliente' && curEst) { previsaoLabel = 'Sai'; previsaoHora = fh(curEst.fimServico) }
      else if (lastEst?.retorno && !ultimaVisita?.retorno) { previsaoLabel = 'Retorno'; previsaoHora = fh(lastEst.retorno) }
      else if (ultimaVisita?.retorno) { previsaoLabel = 'Voltou'; previsaoHora = fHora(ultimaVisita.retorno) }

      // Tempo na oficina após retorno (se retornou antes das 18:00)
      let naOficinaAposRetorno: { de: string; ate: string } | null = null
      if (ultimaVisita?.retorno) {
        const retMin = isoToMin(ultimaVisita.retorno)
        const fimExpediente = 18 * 60 // 18:00
        if (retMin < fimExpediente) {
          naOficinaAposRetorno = { de: fHora(ultimaVisita.retorno), ate: '18:00' }
        }
      }

      // Detecta OS compartilhada com outro técnico
      const osCompartilhada: Record<string, string> = {}
      for (const os of ordsTec) {
        const parceiro = match(tec.tecnico_nome, os.Os_Tecnico) ? os.Os_Tecnico2 : os.Os_Tecnico
        if (parceiro) {
          const tecParceiro = tecs.find(t => match(t.tecnico_nome, parceiro))
          if (tecParceiro) osCompartilhada[os.Id_Ordem] = tecParceiro.tecnico_nome
        }
      }

      // Detecta desvios de rota: visitas GPS que ficaram paradas 30+ min longe de qualquer cliente agendado
      const desvios: DesvioRota[] = []
      const todasCoords = ext.map(a => a.coordenadas).filter(Boolean) as { lat: number; lng: number }[]
      for (let vi = 0; vi < reais.length; vi++) {
        const vis = reais[vi]
        if (vis.lat == null || vis.lng == null) continue
        if (vis.almoco || vis.passagemRapida) continue
        // Calcula permanência no local
        const permanencia = vis.chegada && vis.saidaCliente
          ? isoToMin(vis.saidaCliente) - isoToMin(vis.chegada)
          : vis.chegada && !vis.saidaCliente
            ? agora() - isoToMin(vis.chegada)
            : 0
        // Verifica distância de todos os clientes agendados
        const distMin = todasCoords.length > 0
          ? Math.min(...todasCoords.map(c => distanciaKm(vis.lat!, vis.lng!, c.lat, c.lng)))
          : 999
        // Parou 30+ min e está longe (>5km) de qualquer cliente
        if (permanencia >= 30 && distMin > 5) {
          desvios.push({ visitaIdx: vi, visita: vis, permanenciaMin: permanencia })
        }
      }

      return { tec, items, ext, ordsTec, vinculo, viagem, visitasGPS, estimados, lastEst, foraLoja, naOfi, completedVisits, pos, curIdx, curOS, curAgItem, curEst, curGPS, status, cardEndereco, previsaoLabel, previsaoHora, multiDia, naOficinaAposRetorno, osCompartilhada, desvios }
    })
  }, [tecsSorted, porTec, camPorTec, ordensPorTec, vinculoPorTec, viagensPorTec, carAddr, tecs])

  // ── Resumo: carregar do DB quando modal abre, auto-gerar se vazio ──
  function gerarResumoAuto(d: typeof cardData[number]): string {
    const { ordsTec, items, viagem, visitasGPS } = d
    const reais = visitasReais(visitasGPS)
    const partes: string[] = []
    if (viagem?.saida_loja) partes.push(`Técnico saiu da oficina às ${fHora(viagem.saida_loja)}`)
    // Itera na ordem da agenda (ordsTec já sorted por ordem_sequencia)
    const _usadosResumo = new Set<number>()
    for (let oi = 0; oi < ordsTec.length; oi++) {
      const os = ordsTec[oi]
      const agItem = items.find(a => a.id_ordem === os.Id_Ordem)
      const v = agItem ? matchVisitaGPS(reais, agItem, ordsTec, _usadosResumo) : reais[oi]
      if (!v) continue
      const cli = os.Os_Cliente?.split(' ').slice(0, 3).join(' ') || 'cliente'
      if (v.chegada) partes.push(`Chegou em ${cli} (${os.Cidade_Cliente || ''}) às ${fHora(v.chegada)}`)
      if (v.saidaCliente) partes.push(`Saiu de ${cli} às ${fHora(v.saidaCliente)}`)
    }
    if (viagem?.retorno_loja) partes.push(`Retornou à oficina às ${fHora(viagem.retorno_loja)}`)
    return partes.join('. ') + (partes.length ? '.' : '')
  }

  useEffect(() => {
    if (!modalTec) { resumoLoadedRef.current = null; return }
    const d = cardData.find(c => c.tec.tecnico_nome === modalTec)
    if (!d) return
    const primeiro = d.items[0]
    if (primeiro && resumoLoadedRef.current !== modalTec) {
      resumoLoadedRef.current = modalTec
      fetch(`/api/pos/agenda-visao?data=${hoje}&tecnico=${encodeURIComponent(modalTec)}`)
        .then(r => r.ok ? r.json() : [])
        .then((rows: any[]) => {
          const existing = rows.find((r: any) => r.resumo && r.resumo.trim())
          if (existing) { setResumoTec(existing.resumo); return }
          setResumoTec(gerarResumoAuto(d))
        })
        .catch(() => setResumoTec(gerarResumoAuto(d)))
    }
  }, [modalTec, cardData, hoje])

  const salvarResumo = useCallback(async () => {
    if (!modalTec) return
    setSavingResumo(true)
    const d = cardData.find(c => c.tec.tecnico_nome === modalTec)
    if (d) {
      for (const item of d.items) {
        await fetch('/api/pos/agenda-visao', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id, resumo: resumoTec }),
        }).catch(() => {})
      }
    }
    setSavingResumo(false)
  }, [modalTec, cardData, resumoTec])

  const salvarAtividadeOficina = useCallback(async (tecNome: string, texto: string) => {
    setSavingOficina(true)
    setAtividadeOficina(p => ({ ...p, [tecNome]: texto }))
    const d = cardData.find(c => c.tec.tecnico_nome === tecNome)
    if (d && d.items.length > 0) {
      // Salva no primeiro item do técnico
      await fetch('/api/pos/agenda-visao', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.items[0].id, atividade_oficina: texto }),
      }).catch(() => {})
    }
    setSavingOficina(false)
    setEditOficina(null)
  }, [cardData])

  // Carregar atividade_oficina dos items da agenda
  useEffect(() => {
    const map: Record<string, string> = {}
    for (const d of cardData) {
      const item = d.items.find((a: any) => a.atividade_oficina)
      if (item) map[d.tec.tecnico_nome] = (item as any).atividade_oficina
    }
    setAtividadeOficina(p => {
      const merged = { ...p }
      for (const [k, v] of Object.entries(map)) {
        if (!merged[k]) merged[k] = v
      }
      return merged
    })
  }, [cardData])

  // ── Auto-update endereço / mismatch detection ──
  useEffect(() => {
    cardData.forEach(d => {
      if (!d.curAgItem || !d.foraLoja) return
      const gpsAddr = carAddr[d.tec.tecnico_nome]
      if (!gpsAddr) return
      const agendaEndereco = d.curAgItem.endereco || ''
      const osCliente = d.curOS?.Os_Cliente || ''
      const gpsCidade = (gpsAddr.split(',')[0] || '').toLowerCase().trim()

      // Se o usuário marcou como oficina → verifica se o técnico realmente está perto da oficina
      if (agendaEndereco === ENDERECO_OFICINA) {
        const gpsLow = gpsAddr.toLowerCase()
        const estaPertoOficina = gpsLow.includes('piraju') || gpsLow.includes('são sebastião') || gpsLow.includes('sao sebastiao')
        if (!estaPertoOficina && gpsCidade) {
          setAddrMismatch(p => {
            if (p[d.tec.tecnico_nome]?.gpsAddr === gpsAddr) return p
            return { ...p, [d.tec.tecnico_nome]: { osId: d.curOS!.Id_Ordem, agendaId: d.curAgItem!.id, gpsAddr, isOficina: true } }
          })
        }
        return
      }

      // Se o endereço original da OS é da oficina (nome do cliente etc) → atualiza com GPS real
      if (isEnderecoOficina(agendaEndereco, osCliente, d.curOS?.Servico_Oficina)) {
        if (d.curGPS?.chegada && !d.curGPS.saidaCliente) {
          autoUpdateAddr(d.curAgItem.id, gpsAddr)
        }
        return
      }

      // Compara endereço esperado vs localização GPS → mismatch
      if (gpsAddr && agendaEndereco) {
        const esperado = agendaEndereco.toLowerCase()
        if (gpsCidade && !esperado.includes(gpsCidade)) {
          setAddrMismatch(p => {
            if (p[d.tec.tecnico_nome]?.gpsAddr === gpsAddr) return p
            return { ...p, [d.tec.tecnico_nome]: { osId: d.curOS!.Id_Ordem, agendaId: d.curAgItem!.id, gpsAddr, isOficina: false } }
          })
        }
      }
    })
  }, [cardData, carAddr, autoUpdateAddr])

  // ── Sync GPS data to agenda_visao ──
  const lastSyncRef = useRef<Record<string, string>>({})
  useEffect(() => {
    cardData.forEach(d => {
      if (!d.viagem || !d.ordsTec.length) return
      const reais = visitasReais(d.visitasGPS)
      d.ordsTec.forEach((os, osIdx) => {
        const agItem = d.items.find(a => a.id_ordem === os.Id_Ordem)
        if (!agItem) return
        const gps = reais[osIdx] || null
        const saida = d.viagem?.saida_loja ? fHora(d.viagem.saida_loja) : ''
        const chegada = gps?.chegada ? fHora(gps.chegada) : ''
        const saidaCli = gps?.saidaCliente ? fHora(gps.saidaCliente) : ''
        const retorno = d.viagem?.retorno_loja ? fHora(d.viagem.retorno_loja) : ''

        // Verificar se excedeu tempo
        const est = d.estimados[osIdx]
        let excedeu = false
        if (est && gps?.saidaCliente) {
          excedeu = isoToMin(gps.saidaCliente) - est.fimServico > 30
        } else if (est && gps?.chegada && !gps?.saidaCliente) {
          excedeu = agora() - est.fimServico > 30
        }

        const key = `${agItem.id}_${saida}_${chegada}_${saidaCli}_${retorno}_${excedeu}`
        if (lastSyncRef.current[String(agItem.id)] === key) return
        lastSyncRef.current[String(agItem.id)] = key

        // Sync to API
        fetch('/api/pos/agenda-visao', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: agItem.id,
            gps_saida_oficina: saida,
            gps_chegada_cliente: chegada,
            gps_saida_cliente: saidaCli,
            gps_retorno_oficina: retorno,
            tempo_excedido: excedeu,
          }),
        }).catch(() => {})
      })
    })
  }, [cardData])

  const stats = useMemo(() => {
    let fora = 0, ofi = 0, totalOS = 0, done = 0
    cardData.forEach(d => { totalOS += d.ordsTec.length; done += d.completedVisits; if (d.foraLoja) fora++; else ofi++ })
    return { fora, ofi, totalOS, done }
  }, [cardData])

  // ── Carregar histórico da agenda_visao ──
  useEffect(() => {
    if (!dataHistorico || dataHistorico === hoje) { setAgendaHistorico(null); return }
    setLoadingHistorico(true)
    fetch(`/api/pos/agenda-visao?data=${dataHistorico}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: AgendaRow[]) => { setAgendaHistorico(rows); setLoadingHistorico(false) })
      .catch(() => { setAgendaHistorico([]); setLoadingHistorico(false) })
  }, [dataHistorico, hoje])

  const verHistorico = agendaHistorico !== null

  // Agrupar agenda histórica por técnico
  const historicoCards = useMemo(() => {
    if (!agendaHistorico) return []
    const porTec: Record<string, AgendaRow[]> = {}
    agendaHistorico.forEach(a => {
      if (!porTec[a.tecnico_nome]) porTec[a.tecnico_nome] = []
      porTec[a.tecnico_nome].push(a)
    })
    return Object.entries(porTec).sort(([a], [b]) => a.localeCompare(b)).map(([nome, items]) => {
      const ordenado = [...items].sort((a, b) => (a.ordem_sequencia || 0) - (b.ordem_sequencia || 0))
      return { tecnico_nome: nome, items: ordenado }
    })
  }, [agendaHistorico])

  return (
    <>
      <style>{CSS}</style>
      <div style={{ background: '#F4F3EF', minHeight: '100vh', margin: '-20px', padding: '20px', borderRadius: 12 }}>
        {/* ══ TOP BAR ══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, padding: '8px 0', borderBottom: '2px solid #111' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#111' }}>{stats.fora}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>em campo</span>
          </div>
          <div style={{ width: 1, height: 22, background: '#111' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#111' }}>{stats.done}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>/{stats.totalOS} visitas</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="date"
              value={dataHistorico || hoje}
              max={hoje}
              onChange={e => setDataHistorico(e.target.value === hoje ? '' : e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid #E0DDD8', fontSize: 13, fontWeight: 600, background: verHistorico ? '#FEF3C7' : '#fff', color: '#111', cursor: 'pointer' }}
            />
            {verHistorico && (
              <button className="vg-btn" onClick={() => setDataHistorico('')} style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Hoje
              </button>
            )}
          </div>
          {!verHistorico && (
            <button className="vg-btn" onClick={sincronizar} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} /> Sync
            </button>
          )}
        </div>

        {/* ══ HISTÓRICO ══ */}
        {verHistorico && (
          loadingHistorico ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#999', fontSize: 14 }}>Carregando histórico...</div>
          ) : historicoCards.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#999', fontSize: 14 }}>Nenhum registro salvo para {new Date(dataHistorico + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '8px 16px', borderRadius: 8, marginBottom: 16, textAlign: 'center' }}>
                Histórico de {new Date(dataHistorico + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
              {[0, 1].map(row => {
                const metade = Math.ceil(historicoCards.length / 2)
                const slice = row === 0 ? historicoCards.slice(0, metade) : historicoCards.slice(metade)
                return (
                  <div key={row} style={{ display: 'flex', gap: 20, marginBottom: row === 0 ? 20 : 0, overflowX: 'auto', paddingBottom: 4 }}>
                    {slice.map(card => {
                      const nome = card.tecnico_nome.split(' ')
                      const primeiroNome = nome[0]
                      const sobrenome = nome.length > 1 ? nome[1] : ''
                      const iniciais = nome.length > 1 ? (nome[0][0] + nome[nome.length - 1][0]).toUpperCase() : nome[0].substring(0, 2).toUpperCase()
                      const hasOS = card.items.length > 0
                      const temGps = card.items.some(a => (a as any).gps_saida_oficina || (a as any).gps_chegada_cliente)
                      return (
                        <div key={card.tecnico_nome} className="vg-figurinha" style={{
                          borderRadius: 20, flex: '1 1 0', minWidth: 280,
                          background: '#fff', border: '2px solid #E5E3DD',
                          boxShadow: '0 4px 16px rgba(0,0,0,.06)',
                        }}>
                          {/* TOPO */}
                          <div style={{
                            background: hasOS ? 'linear-gradient(135deg, #8B0000 0%, #B22222 100%)' : '#E8E6E1',
                            padding: '14px 20px 12px', borderRadius: '18px 18px 0 0',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <div style={{
                                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                background: hasOS ? 'rgba(255,255,255,.12)' : '#D5D3CE',
                                border: `2px solid ${hasOS ? 'rgba(255,255,255,.25)' : '#C0BDB7'}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <span style={{ fontSize: 20, fontWeight: 900, color: hasOS ? '#fff' : '#111' }}>{iniciais}</span>
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 22, fontWeight: 900, color: hasOS ? '#fff' : '#111', letterSpacing: '-.03em', lineHeight: 1.1, textTransform: 'uppercase' }}>
                                  {primeiroNome} {sobrenome && <span style={{ fontSize: 15, fontWeight: 700, opacity: .7 }}>{sobrenome}</span>}
                                </div>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,.2)', padding: '4px 12px', borderRadius: 20 }}>
                                {card.items.length} OS
                              </div>
                            </div>
                          </div>
                          {/* CONTEÚDO */}
                          <div style={{ padding: '14px 20px 18px' }}>
                            {card.items.map((a: any) => (
                              <div key={a.id_ordem || a.id} style={{
                                padding: '12px 14px', borderRadius: 10, marginBottom: 8,
                                background: '#F9F9F7', border: '1px solid #E5E3DD',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>OS {a.id_ordem}</span>
                                  <span style={{ fontSize: 12, color: '#666' }}>{a.qtd_horas}h</span>
                                </div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 4 }}>
                                  {(a.cliente || '').split(' ').slice(0, 5).join(' ')}
                                </div>
                                {a.cidade && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#555', marginBottom: 4 }}>
                                    <MapPin size={12} /> {a.cidade}
                                  </div>
                                )}
                                {a.endereco && (
                                  <div style={{ fontSize: 12, color: '#888', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {a.endereco}
                                  </div>
                                )}
                                {/* GPS salvo */}
                                {(a.gps_saida_oficina || a.gps_chegada_cliente || a.gps_saida_cliente || a.gps_retorno_oficina) && (
                                  <div style={{ fontSize: 12, color: '#555', lineHeight: 1.8, padding: '6px 10px', background: '#F0EFEB', borderRadius: 6, marginTop: 4 }}>
                                    {a.gps_saida_oficina && <div><span style={{ fontWeight: 700 }}>Saída oficina:</span> {a.gps_saida_oficina}</div>}
                                    {a.gps_chegada_cliente && <div><span style={{ fontWeight: 700 }}>Chegada cliente:</span> {a.gps_chegada_cliente}</div>}
                                    {a.gps_saida_cliente && <div><span style={{ fontWeight: 700 }}>Saiu cliente:</span> {a.gps_saida_cliente}</div>}
                                    {a.gps_retorno_oficina && <div><span style={{ fontWeight: 700 }}>Retorno:</span> {a.gps_retorno_oficina}</div>}
                                  </div>
                                )}
                                {/* Resumo */}
                                {a.resumo && (
                                  <div style={{ fontSize: 12, color: '#333', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
                                    {a.resumo}
                                  </div>
                                )}
                              </div>
                            ))}
                            {!hasOS && (
                              <div style={{ textAlign: 'center', color: '#ccc', fontSize: 13, padding: 20 }}>Sem ordens neste dia</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )
        )}

        {/* ══ FIGURINHAS — 2 fileiras ══ */}
        {!verHistorico && [0, 1].map(row => {
          const metade = Math.ceil(cardData.length / 2)
          const items = row === 0 ? cardData.slice(0, metade) : cardData.slice(metade)
          return (
            <div key={row} style={{ display: 'flex', gap: 20, marginBottom: row === 0 ? 20 : 0, overflowX: 'auto', paddingBottom: 4 }}>
              {items.map((d, di) => {
            const { tec, ordsTec, foraLoja, status, previsaoHora, previsaoLabel, completedVisits, curOS, curAgItem, pos, multiDia } = d
            const mismatch = addrMismatch[tec.tecnico_nome]
            const hasOS = ordsTec.length > 0 || !!d.viagem
            const nome = tec.tecnico_nome.split(' ')
            const primeiroNome = nome[0]
            const sobrenome = nome.length > 1 ? nome.slice(1).join(' ') : ''
            const iniciais = nome.length > 1 ? (nome[0][0] + nome[nome.length - 1][0]).toUpperCase() : nome[0].substring(0, 2).toUpperCase()
            const statusLabel = status === 'oficina' ? 'Oficina' : status === 'caminho' ? 'A caminho' : status === 'cliente' ? 'No cliente' : status === 'retornando' ? 'Voltando' : status === 'retornou' ? 'Retornou' : ''
            const enderecoCarro = carAddr[tec.tecnico_nome] || ''
            const solicitacao = curOS ? extrairSolicitacao(curOS.Serv_Solicitado || '') : ''
            const tipoServico = curOS?.Tipo_Servico || ''

            return (
              <div key={tec.user_id} className={`vg-figurinha ${foraLoja ? 'vg-pulse-glow' : ''}`}
                onClick={() => setModalTec(tec.tecnico_nome)}
                style={{
                  borderRadius: 20, flex: '1 1 0', minWidth: 280,
                  background: '#fff', border: `2px solid ${foraLoja ? '#222' : '#E5E3DD'}`,
                  boxShadow: '0 4px 16px rgba(0,0,0,.06)',
                  animationDelay: `${(row * Math.ceil(cardData.length / 2) + di) * .08}s`,
                }}>

                {/* ── TOPO: NOME + LOCALIZAÇÃO ── */}
                <div style={{
                  background: hasOS
                    ? 'linear-gradient(135deg, #8B0000 0%, #B22222 100%)'
                    : '#E8E6E1',
                  padding: '14px 20px 12px',
                  position: 'relative', borderRadius: '18px 18px 0 0',
                }}>
                  {/* Linha 1: avatar + nome + status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                      background: hasOS ? 'rgba(255,255,255,.12)' : '#D5D3CE',
                      border: `2px solid ${hasOS ? 'rgba(255,255,255,.25)' : '#C0BDB7'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: hasOS ? '#fff' : '#111' }}>{iniciais}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: hasOS ? '#fff' : '#111', letterSpacing: '-.03em', lineHeight: 1.1, textTransform: 'uppercase' }}>
                        {primeiroNome} {sobrenome && <span style={{ fontSize: 15, fontWeight: 700, opacity: .7 }}>{sobrenome.split(' ')[0]}</span>}
                      </div>
                    </div>
                    {hasOS && (
                      <div style={{
                        fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em',
                        color: '#fff',
                        background: status === 'oficina' ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.25)',
                        padding: '4px 12px', borderRadius: 20, flexShrink: 0,
                      }}>
                        {statusLabel}
                      </div>
                    )}
                  </div>
                  {/* Mismatch - só o ponto no header, balão fica embaixo */}
                </div>

                {/* ── DESTINO + LOCALIZAÇÃO ── */}
                <div>
                  {(() => {
                    const isOficina = curAgItem?.endereco === ENDERECO_OFICINA || !!curOS?.Servico_Oficina
                    const cidade = isOficina ? 'PIRAJU (SP) — Oficina' : curOS?.Cidade_Cliente
                    const endereco = isOficina ? ENDERECO_OFICINA : curOS?.Endereco_Cliente
                    return cidade ? (
                      <div style={{ background: isOficina ? '#FEF2F2' : '#F7F6F3', padding: '10px 20px 12px', borderBottom: '2px solid #E0DDD8' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Destino</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={16} color={isOficina ? '#B91C1C' : '#111'} />
                          <span style={{ fontSize: 17, fontWeight: 800, color: isOficina ? '#B91C1C' : '#111' }}>{cidade}</span>
                          {endereco && !isOficina && (
                            <span style={{ fontSize: 13, fontWeight: 500, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{endereco}</span>
                          )}
                        </div>
                      </div>
                    ) : null
                  })()}
                  {enderecoCarro ? (
                    <div className={pos?.ignicao && pos.velocidade > 0 ? 'vg-car-blink' : ''} style={{
                      padding: '10px 20px 12px', borderBottom: '2px solid #E0DDD8',
                      background: pos?.ignicao && pos.velocidade > 0 ? '#F0FDF4' : '#FAFAF8',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Localização Atual</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={pos?.ignicao && pos.velocidade > 0 ? 'vg-car-moving' : ''} style={{
                          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                          background: pos?.ignicao && pos.velocidade > 0 ? '#22C55E' : '#DDD',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Car size={14} color="#fff" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {enderecoCarro}
                          </div>
                          <div style={{ fontSize: 13, color: '#111', marginTop: 2 }}>
                            {pos?.ignicao ? (
                              <span>
                                <span style={{ color: pos.velocidade > 0 ? '#16A34A' : '#111', fontWeight: 700 }}>
                                  {pos.velocidade > 0 ? `${pos.velocidade} km/h` : 'Parado'}
                                </span>
                                <span style={{ marginLeft: 8 }}>às {fHora(pos.dt)}</span>
                              </span>
                            ) : (
                              <span style={{ color: '#111', fontWeight: 600 }}>Ignição OFF</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* ── MISMATCH BALÃO ── */}
                {mismatch && (
                  <div style={{ padding: '10px 20px', background: '#FFF8EE', borderBottom: '1px solid #FDE68A' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <AlertTriangle size={15} color="#fff" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                          {mismatch.isOficina
                            ? 'O serviço é na oficina, mas o técnico está em outro lugar. Está certo?'
                            : 'O técnico está em um endereço diferente da OS. Está correto?'}
                        </div>
                        <div style={{ fontSize: 12, color: '#B45309', marginBottom: 8, lineHeight: 1.3 }}>
                          GPS: <span style={{ fontWeight: 600 }}>{mismatch.gpsAddr}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="vg-btn" onClick={() => aplicarEnderecoGPS(mismatch.agendaId, mismatch.gpsAddr, tec.tecnico_nome)}
                            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Atualizar endereço
                          </button>
                          <button className="vg-btn" onClick={() => setAddrMismatch(p => { const n = { ...p }; delete n[tec.tecnico_nome]; return n })}
                            style={{ background: '#fff', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            Está correto
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── CONTEÚDO ── */}
                <div>
                {hasOS ? (
                  <div style={{ padding: '18px 24px 20px' }}>
                    {/* OS */}
                    {curOS && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#111', letterSpacing: '.05em' }}>OS</span>
                          <span style={{ fontSize: 22, fontWeight: 900, color: '#111', letterSpacing: '-.02em' }}>{curOS.Id_Ordem}</span>
                          {tipoServico && (
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#111', background: '#F0EFEB', padding: '3px 10px', borderRadius: 6 }}>{tipoServico}</span>
                          )}
                          {d.osCompartilhada[curOS.Id_Ordem] && (
                            <span style={{
                              fontSize: 12, fontWeight: 800, color: '#7C3AED', background: '#EDE9FE',
                              padding: '2px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
                              border: '1.5px solid #C4B5FD',
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                              {d.osCompartilhada[curOS.Id_Ordem].split(' ')[0]}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>
                          {curOS.Os_Cliente?.split(' ').slice(0, 6).join(' ')}
                        </div>
                        {curOS.Previsao_Execucao && (() => {
                          const inicio = new Date(curOS.Previsao_Execucao + 'T12:00:00')
                          const h = parseFloat(String(curOS.Qtd_HR || 0)) || 0
                          const multiDia = curOS.Previsao_Faturamento && curOS.Previsao_Faturamento > curOS.Previsao_Execucao
                          const diasPorData = multiDia ? Math.round((new Date(curOS.Previsao_Faturamento + 'T00:00:00').getTime() - new Date(curOS.Previsao_Execucao + 'T00:00:00').getTime()) / 86400000) + 1 : 1
                          const usaFaturamento = diasPorData > 2

                          if (usaFaturamento) {
                            // Mais de 2 dias → mostra data início e data fim (faturamento)
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 800, color: '#065F46', background: '#D1FAE5', padding: '3px 10px', borderRadius: 6 }}>
                                  Início: {inicio.toLocaleDateString('pt-BR')}
                                </span>
                                <span style={{ fontWeight: 800, color: '#991B1B', background: '#FEE2E2', padding: '3px 10px', borderRadius: 6 }}>
                                  Fim: {new Date(curOS.Previsao_Faturamento + 'T12:00:00').toLocaleDateString('pt-BR')} ({diasPorData} dias)
                                </span>
                              </div>
                            )
                          }

                          // 2 dias ou menos → mostra previsão com deslocamento + GPS real
                          let cursorCard = S
                          let almocoCard = false
                          let horaInicioAdj = fh(S), horaFimAdj = ''
                          const reaisCard = visitasReais(d.visitasGPS)
                          const _usadosCard = new Set<number>()
                          for (let oi = 0; oi <= d.curIdx; oi++) {
                            const osI = ordsTec[oi]
                            const agI = d.items.find(a => a.id_ordem === osI?.Id_Ordem)
                            const gpsCard = agI ? matchVisitaGPS(reaisCard, agI, ordsTec, _usadosCard) : undefined
                            const idaI = agI?.tempo_ida_min || 0
                            const hrsI = (agI?.qtd_horas || parseFloat(String(osI?.Qtd_HR || 0)) || 2) * 60
                            const saidaI = gpsCard?.saida ? isoToMin(gpsCard.saida) : cursorCard
                            cursorCard = saidaI
                            const chegadaI = gpsCard?.chegada ? isoToMin(gpsCard.chegada) : cursorCard + idaI
                            cursorCard = chegadaI
                            if (!almocoCard && cursorCard >= AI && cursorCard < AI + 120) { cursorCard += AD; almocoCard = true }
                            const fimI = gpsCard?.saidaCliente ? isoToMin(gpsCard.saidaCliente) : cursorCard + hrsI
                            cursorCard = fimI
                            if (!almocoCard && cursorCard >= AI && cursorCard < AI + 120) { cursorCard += AD; almocoCard = true }
                            if (oi === d.curIdx) { horaInicioAdj = fh(chegadaI); horaFimAdj = fh(fimI) }
                          }
                          if (!horaFimAdj) horaFimAdj = fh(cursorCard)
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, color: '#065F46', background: '#D1FAE5', padding: '3px 10px', borderRadius: 6 }}>
                                {inicio.toLocaleDateString('pt-BR')}
                              </span>
                              <span style={{ fontWeight: 800, color: '#1E3A5F', background: '#DBEAFE', padding: '3px 10px', borderRadius: 6 }}>
                                {horaInicioAdj} → {horaFimAdj}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{h}h serviço</span>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Solicitação */}
                    {solicitacao && (
                      <div style={{
                        fontSize: 15, fontWeight: 600, color: '#111', lineHeight: 1.5, marginBottom: 14,
                        padding: '12px 16px', background: '#FFFDF5', borderRadius: 10,
                        borderLeft: '4px solid #E8C94A',
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>
                        {solicitacao}
                      </div>
                    )}

                    {/* Desvios de rota */}
                    {d.desvios.filter(dv => !desviosConfirmados[`${tec.tecnico_nome}_${dv.visitaIdx}`]).map(dv => (
                      <div key={dv.visitaIdx} onClick={e => e.stopPropagation()} style={{
                        padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                        background: '#FEF2F2', border: '2px solid #FECACA',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <AlertTriangle size={14} color="#DC2626" />
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#991B1B' }}>Parada fora do cliente — {fm(dv.permanenciaMin)}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#991B1B', marginBottom: 6 }}>
                          {dv.visita.chegada && <span>{fHora(dv.visita.chegada)}</span>}
                          {dv.visita.saidaCliente && <span> → {fHora(dv.visita.saidaCliente)}</span>}
                          {dv.visita.destino_nome && <span> • {dv.visita.destino_nome}</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="vg-btn" onClick={() => setDesviosConfirmados(p => ({ ...p, [`${tec.tecnico_nome}_${dv.visitaIdx}`]: 'cliente' }))}
                            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            É o cliente
                          </button>
                          <button className="vg-btn" onClick={async () => {
                            setDesviosConfirmados(p => ({ ...p, [`${tec.tecnico_nome}_${dv.visitaIdx}`]: 'desvio' }))
                            // Salvar no resumo
                            const dd = cardData.find(c => c.tec.tecnico_nome === tec.tecnico_nome)
                            if (dd && dd.items.length > 0) {
                              const hora = dv.visita.chegada ? fHora(dv.visita.chegada) : ''
                              const txt = `Desvio de rota: parou ${fm(dv.permanenciaMin)} às ${hora}${dv.visita.destino_nome ? ` (${dv.visita.destino_nome})` : ''}`
                              await fetch('/api/pos/agenda-visao', {
                                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: dd.items[0].id, resumo: txt }),
                              }).catch(() => {})
                            }
                          }}
                            style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            Desvio de rota
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Na oficina após retorno */}
                    {d.naOficinaAposRetorno && (
                      <div
                        onClick={(e) => { e.stopPropagation(); setEditOficina({ tecnico: tec.tecnico_nome, texto: atividadeOficina[tec.tecnico_nome] || '' }) }}
                        style={{
                          padding: '10px 14px', borderRadius: 10, marginBottom: 10,
                          background: '#F0F4FF', border: '2px solid #BFDBFE',
                          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                        }}>
                        <Home size={16} color="#1E3A5F" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#1E3A5F' }}>Na oficina</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#3B82F6' }}>{d.naOficinaAposRetorno.de} → {d.naOficinaAposRetorno.ate}</div>
                          {atividadeOficina[tec.tecnico_nome] && (
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1E3A5F', marginTop: 4, lineHeight: 1.4 }}>
                              {atividadeOficina[tec.tecnico_nome]}
                            </div>
                          )}
                          {!atividadeOficina[tec.tecnico_nome] && (
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#93C5FD', marginTop: 2, fontStyle: 'italic' }}>
                              Clique para registrar atividade
                            </div>
                          )}
                        </div>
                        <Edit3 size={14} color="#93C5FD" />
                      </div>
                    )}

                    {/* Previsão + progress */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: '2px solid #E0DDD8', paddingTop: 14 }}>
                      {previsaoHora ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                          <span style={{ fontSize: 15, color: '#111', fontWeight: 700 }}>{previsaoLabel}</span>
                          <span style={{ fontSize: 24, fontWeight: 900, color: '#111', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{previsaoHora}</span>
                        </div>
                      ) : <div />}
                      <div style={{ flex: 1 }} />
                      {ordsTec.length > 0 && (
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          {ordsTec.map((_, i) => (
                            <div key={i} style={{
                              width: 12, height: 12, borderRadius: '50%',
                              background: i < completedVisits ? '#111' : i === d.curIdx ? '#999' : '#E0DDD8',
                              transition: 'background .3s',
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center' }}>
                    <span style={{ fontSize: 16, color: '#111', fontWeight: 600 }}>Na oficina / sem OS</span>
                  </div>
                )}
                </div>
              </div>
            )
          })}
            </div>
          )
        })}
      </div>

      {/* ══ MODAL ══ */}
      {modalTec && (() => {
        const d = cardData.find(c => c.tec.tecnico_nome === modalTec)
        if (!d) return null
        const { items, ordsTec, vinculo, viagem, visitasGPS, estimados, lastEst, foraLoja, pos } = d
        const addr = carAddr[modalTec]
        let chegadaCount = 0

        return (
          <div className="vg-modal-overlay" onClick={() => { setModalTec(null); setEditingAddr(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
            <div className="vg-modal-body" onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 780, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>

              {/* ── HEADER ── */}
              <div style={{ padding: '24px 32px 18px', background: '#FAFAFA', borderBottom: '2px solid #111' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h2 style={{ fontSize: 28, fontWeight: 900, color: '#111', margin: 0 }}>{modalTec}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                      {vinculo && <span style={{ fontSize: 16, fontWeight: 700, color: '#111', background: '#F0F0F0', padding: '3px 10px', borderRadius: 6 }}>{vinculo.placa}</span>}
                      <span style={{ fontSize: 16, fontWeight: 600, color: '#111' }}>{ordsTec.length} OS · {d.completedVisits} concluídas</span>
                      {d.previsaoLabel && (
                        <span style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>{d.previsaoLabel} {d.previsaoHora}</span>
                      )}
                    </div>
                    {ordsTec.length > 0 && (
                      <div style={{ display: 'flex', gap: 5, marginTop: 10 }}>
                        {ordsTec.map((_, i) => (
                          <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i < d.completedVisits ? '#111' : i === d.curIdx ? '#999' : '#E0E0E0' }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setModalTec(null); setEditingAddr(null) }}
                    style={{ background: '#F0F0F0', border: 'none', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#999', flexShrink: 0 }}>
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* ── POSIÇÃO ATUAL ── */}
              {pos && (
                <div style={{ padding: '16px 32px', borderBottom: '1px solid #DDD', background: '#FAFAFA' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Navigation size={18} color="#111" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#111' }}>{addr || 'Buscando endereço...'}</div>
                      <div style={{ fontSize: 15, color: '#111', marginTop: 2 }}>
                        {pos.ignicao ? <span style={{ fontWeight: 700 }}>{pos.velocidade} km/h</span> : <span style={{ fontWeight: 600 }}>Ignição OFF</span>}
                        <span style={{ marginLeft: 10 }}>às {fHora(pos.dt)}</span>
                      </div>
                    </div>
                    <a href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: '#111', textDecoration: 'none', padding: '7px 14px', border: '1px solid #111', borderRadius: 8, background: '#fff', flexShrink: 0 }}>
                      <ExternalLink size={13} /> Mapa
                    </a>
                  </div>
                </div>
              )}

              {/* ── VEÍCULO ── */}
              <div style={{ padding: '10px 32px', borderBottom: '1px solid #DDD', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Car size={15} color="#111" />
                <select value={vinculo?.adesao_id || ''}
                  onChange={e => { const v = Number(e.target.value); if (v) vincularVeiculo(modalTec, v); else desvincularVeiculo(modalTec) }}
                  style={{ flex: 1, padding: '7px 12px', borderRadius: 8, fontSize: 15, border: '1px solid #111', background: '#fff', color: '#111', outline: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  <option value="">Vincular veiculo...</option>
                  {veiculos.map(v => <option key={v.id} value={v.id} disabled={veiculosVinculados.has(v.id) && vinculo?.adesao_id !== v.id}>{v.placa} - {v.descricao || 'Sem desc'}</option>)}
                </select>
                {gpsLoading && vinculo && <RefreshCw size={14} color="#111" className="animate-spin" />}
              </div>

              {/* ── JORNADA GPS ── */}
              {viagem && viagem.eventos.filter(ev => EVENTO_LABEL[ev.tipo]).length > 0 && (() => {
                let ci = 0, si = 0, li = 0
                // Cidades dos destinos agendados pra comparar com GPS
                const cidadesDestino = items.map(a => (a.cidade || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()).filter(Boolean)
                const enderecoDestino = items.map(a => (a.endereco || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()).filter(Boolean)

                function isPertoDestino(addr: string): boolean {
                  if (!addr) return false
                  const low = addr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                  return cidadesDestino.some(c => c && low.includes(c)) || enderecoDestino.some(e => e && low.includes(e.split(',')[0]))
                }

                // Detectar se ficou na oficina de manhã (saiu depois das 11:30)
                const primeiraSaida = viagem.eventos.find(ev => ev.tipo === 'saida_loja')
                const saiuTarde = primeiraSaida && isoToMin(primeiraSaida.horario) >= 690 // 11:30

                // Detectar saídas rápidas (saiu e voltou em < 20 min SEM passar em nenhum cliente)
                const evsFiltrados = viagem.eventos.filter(ev => EVENTO_LABEL[ev.tipo])
                const saidasRapidas = new Set<number>()
                for (let ei = 0; ei < evsFiltrados.length; ei++) {
                  if (evsFiltrados[ei].tipo === 'saida_loja') {
                    const retIdx = evsFiltrados.findIndex((e, j) => j > ei && e.tipo === 'retorno_loja')
                    if (retIdx !== -1) {
                      const diffMin = isoToMin(evsFiltrados[retIdx].horario) - isoToMin(evsFiltrados[ei].horario)
                      // Só é saída rápida se não passou em nenhum cliente entre saída e retorno
                      const teveCliente = evsFiltrados.slice(ei + 1, retIdx).some(e => e.tipo === 'chegada_cliente')
                      if (diffMin < 20 && !teveCliente) {
                        for (let k = ei; k <= retIdx; k++) saidasRapidas.add(k)
                      }
                    }
                  }
                }

                return (
                  <div style={{ padding: '20px 32px', borderBottom: '1px solid #DDD' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 14 }}>Jornada GPS</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 52, top: 10, bottom: 10, width: 2, background: '#EBEBEB' }} />

                      {saiuTarde && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '6px 0', position: 'relative' }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums', minWidth: 48 }}>08:00</span>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', marginTop: 4, flexShrink: 0, position: 'relative', zIndex: 1, background: '#111', border: '2px solid #fff' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>Na oficina (manhã)</div>
                            <div style={{ fontSize: 14, color: '#111', marginTop: 2 }}>Saiu às {fHora(primeiraSaida!.horario)}</div>
                          </div>
                        </div>
                      )}

                      {evsFiltrados.map((ev, i) => {
                        // Saída rápida (< 20 min ida e volta) = mostrar compacto
                        if (saidasRapidas.has(i)) {
                          if (ev.tipo === 'saida_loja') {
                            const retEv = evsFiltrados.find((e, j) => j > i && e.tipo === 'retorno_loja' && saidasRapidas.has(j))
                            const diffMin = retEv ? isoToMin(retEv.horario) - isoToMin(ev.horario) : 0
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '6px 0', position: 'relative' }}>
                                <span style={{ fontSize: 17, fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums', minWidth: 48 }}>{fHora(ev.horario)}</span>
                                <div style={{ width: 12, height: 12, borderRadius: '50%', marginTop: 4, flexShrink: 0, position: 'relative', zIndex: 1, background: '#111', border: '2px solid #fff' }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>Saída rápida ({diffMin} min)</div>
                                  <div style={{ fontSize: 14, color: '#111' }}>Voltou às {retEv ? fHora(retEv.horario) : '?'}</div>
                                </div>
                              </div>
                            )
                          }
                          if (ev.tipo === 'chegada_cliente') ci++
                          else if (ev.tipo === 'saida_cliente') si++
                          return null
                        }

                        const isChegada = ev.tipo === 'chegada_cliente'
                        const isSaida = ev.tipo === 'saida_cliente'
                        const isLoja = ev.tipo.includes('loja')
                        let evAddr: string | null = null
                        if (isChegada) { evAddr = eventAddrs[`${modalTec}_cheg_${ci}`] || null; ci++ }
                        else if (isSaida) { evAddr = eventAddrs[`${modalTec}_said_${si}`] || null; si++ }
                        else if (isLoja) { evAddr = eventAddrs[`${modalTec}_loja_${li}`] || null; li++ }
                        const addrDisplay = evAddr || `${ev.lat.toFixed(4)}, ${ev.lng.toFixed(4)}`

                        // Usa destino_nome da Rota Exata quando disponível
                        const destinoLabel = ev.destino_nome || null

                        // Calcular tempo de permanência (chegada → próxima saída)
                        let permanencia = ''
                        if (isChegada) {
                          const proxSaida = evsFiltrados.find((e, j) => j > i && (e.tipo === 'saida_cliente' || e.tipo === 'retorno_loja'))
                          if (proxSaida) {
                            const diff = isoToMin(proxSaida.horario) - isoToMin(ev.horario)
                            if (diff > 0) permanencia = fm(diff)
                          }
                        }

                        // Label inteligente
                        let label = EVENTO_LABEL[ev.tipo]
                        let isParada = false
                        if (isChegada) {
                          if (destinoLabel) {
                            label = `Chegou — ${destinoLabel}`
                          } else if (!evAddr || !isPertoDestino(evAddr)) {
                            label = 'Parada'
                            isParada = true
                          } else {
                            label = 'Chegou no cliente'
                          }
                        }
                        if (isSaida) {
                          if (destinoLabel) {
                            label = `Saiu — ${destinoLabel}`
                          } else {
                            label = evAddr ? `Saiu do cliente` : 'Saiu'
                          }
                        }

                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', position: 'relative', borderBottom: '1px solid #F0F0F0' }}>
                            <span style={{ fontSize: 17, fontWeight: 800, color: '#111', fontVariantNumeric: 'tabular-nums', minWidth: 48 }}>{fHora(ev.horario)}</span>
                            <div style={{
                              width: 12, height: 12, borderRadius: '50%', marginTop: 4, flexShrink: 0, position: 'relative', zIndex: 1,
                              background: isLoja ? '#111' : isParada ? '#F59E0B' : isSaida ? '#DC2626' : '#16A34A',
                              border: '2px solid #fff',
                            }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 16, fontWeight: 700, color: isParada ? '#B45309' : isSaida ? '#991B1B' : isChegada ? '#065F46' : '#111' }}>{label}</span>
                                {permanencia && <span style={{ fontSize: 16, fontWeight: 800, color: '#fff', background: isParada ? '#F59E0B' : '#111', padding: '4px 14px', borderRadius: 6 }}>Parou {permanencia}</span>}
                              </div>
                              {/* Endereço + link mapa em todos os eventos */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: isChegada || isParada ? 14 : 13, color: '#555', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <MapPin size={12} style={{ flexShrink: 0, color: '#888' }} /> {addrDisplay}
                                </span>
                                <a href={`https://www.google.com/maps?q=${ev.lat},${ev.lng}`} target="_blank" rel="noopener noreferrer"
                                  style={{ fontSize: 13, color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: 3, textDecoration: 'none', fontWeight: 600 }}
                                  onClick={e => e.stopPropagation()}>
                                  <ExternalLink size={11} style={{ flexShrink: 0 }} /> Ver no mapa
                                </a>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* ── DESVIOS ── */}
              {d.desvios.length > 0 && (
                <div style={{ padding: '14px 24px', borderBottom: '1px solid #DDD' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                    <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                    Paradas fora do cliente
                  </div>
                  {d.desvios.map(dv => {
                    const key = `${modalTec}_${dv.visitaIdx}`
                    const confirmacao = desviosConfirmados[key]
                    return (
                      <div key={dv.visitaIdx} style={{
                        padding: '12px 16px', borderRadius: 10, marginBottom: 8,
                        background: confirmacao === 'desvio' ? '#FEE2E2' : confirmacao === 'cliente' ? '#F0FDF4' : '#FEF2F2',
                        border: `2px solid ${confirmacao === 'desvio' ? '#FECACA' : confirmacao === 'cliente' ? '#BBF7D0' : '#FECACA'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: '#111' }}>
                            {dv.visita.chegada && fHora(dv.visita.chegada)}
                            {dv.visita.saidaCliente && ` → ${fHora(dv.visita.saidaCliente)}`}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '2px 10px', borderRadius: 6 }}>
                            {fm(dv.permanenciaMin)} parado
                          </span>
                          {confirmacao === 'desvio' && <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', background: '#FECACA', padding: '2px 8px', borderRadius: 4 }}>DESVIO</span>}
                          {confirmacao === 'cliente' && <span style={{ fontSize: 12, fontWeight: 800, color: '#059669', background: '#D1FAE5', padding: '2px 8px', borderRadius: 4 }}>CONFIRMADO</span>}
                        </div>
                        {dv.visita.destino_nome && (
                          <div style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>
                            <MapPin size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                            {dv.visita.destino_nome}
                          </div>
                        )}
                        {dv.visita.lat != null && (
                          <div style={{ marginBottom: 8 }}>
                            <a href={`https://www.google.com/maps?q=${dv.visita.lat},${dv.visita.lng}`} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 13, color: '#2563EB', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontWeight: 600 }}
                              onClick={e => e.stopPropagation()}>
                              <ExternalLink size={11} /> Ver local no mapa
                            </a>
                          </div>
                        )}
                        {!confirmacao && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="vg-btn" onClick={() => setDesviosConfirmados(p => ({ ...p, [key]: 'cliente' }))}
                              style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              É o cliente
                            </button>
                            <button className="vg-btn" onClick={async () => {
                              setDesviosConfirmados(p => ({ ...p, [key]: 'desvio' }))
                              if (d.items.length > 0) {
                                const hora = dv.visita.chegada ? fHora(dv.visita.chegada) : ''
                                const txt = `Desvio de rota: parou ${fm(dv.permanenciaMin)} às ${hora}${dv.visita.destino_nome ? ` (${dv.visita.destino_nome})` : ''}`
                                await fetch('/api/pos/agenda-visao', {
                                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: d.items[0].id, resumo: txt }),
                                }).catch(() => {})
                              }
                            }}
                              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              Desvio de rota
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── ORDENS ── */}
              {ordsTec.length > 0 && (
                <div style={{ padding: '14px 24px 6px' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: '.05em' }}>Ordens de serviço</div>
                </div>
              )}

              {(() => { const _usadosModal = new Set<number>()
                const _usadosPrev = new Set<number>()
                const reaisModalPrev = visitasReais(visitasGPS)
                // Calcula previsões com deslocamento + GPS real (ordsTec já vem ordenado pela agenda)
                const prevAjustados: { saida: number; chegada: number; fim: number; retorno: number | null }[] = []
                let cursorPrev = S
                let almocoPrev = false
                for (let pi = 0; pi < ordsTec.length; pi++) {
                  const osP = ordsTec[pi]
                  const agP = items.find(a => a.id_ordem === osP.Id_Ordem)
                  const gpsPrev = agP ? matchVisitaGPS(reaisModalPrev, agP, ordsTec, _usadosPrev) : undefined
                  const ida = agP?.tempo_ida_min || 0
                  const sv = (agP?.qtd_horas || parseFloat(String(osP.Qtd_HR || 0)) || 2) * 60
                  const volta = agP?.tempo_volta_min || 0
                  const saida = gpsPrev?.saida ? isoToMin(gpsPrev.saida) : cursorPrev
                  cursorPrev = saida
                  const chegada = gpsPrev?.chegada ? isoToMin(gpsPrev.chegada) : cursorPrev + ida
                  cursorPrev = chegada
                  if (!almocoPrev && cursorPrev >= AI && cursorPrev < AI + 120) { cursorPrev += AD; almocoPrev = true }
                  const fim = gpsPrev?.saidaCliente ? isoToMin(gpsPrev.saidaCliente) : cursorPrev + sv
                  cursorPrev = fim
                  if (!almocoPrev && cursorPrev >= AI && cursorPrev < AI + 120) { cursorPrev += AD; almocoPrev = true }
                  let retorno: number | null = null
                  if (pi === ordsTec.length - 1) {
                    retorno = gpsPrev?.retorno ? isoToMin(gpsPrev.retorno) : cursorPrev + volta
                    cursorPrev = retorno
                  }
                  prevAjustados.push({ saida, chegada, fim, retorno })
                }
                return ordsTec.map((os, osIdx) => {
                const agItem = items.find(a => a.id_ordem === os.Id_Ordem)
                // estimados mapeia 1:1 com ext (items externos na ordem da agenda)
                const extIdx = d.ext.findIndex(e => e.id_ordem === os.Id_Ordem)
                const est = extIdx >= 0 ? estimados[extIdx] : null
                const reaisModal = visitasReais(visitasGPS)
                const gps = agItem ? matchVisitaGPS(reaisModal, agItem, ordsTec, _usadosModal) || null : null
                const prevAdj = prevAjustados[osIdx]
                const isEditing = editingAddr !== null && editingAddr.id === agItem?.id
                const temAtraso = est && gps?.saidaCliente && (isoToMin(gps.saidaCliente) - est.fimServico > 30)
                const chegouAtrasado = est && gps?.chegada && (isoToMin(gps.chegada) - est.chegada > 30)
                const isCurrent = osIdx === d.curIdx
                const isDone = !!(gps?.saidaCliente)

                return (
                  <div key={os.Id_Ordem} style={{
                    padding: '12px 24px', borderTop: '1px solid #DDD',
                    background: isCurrent ? '#F8F8F8' : '#fff',
                    borderLeft: isCurrent ? '4px solid #111' : '4px solid transparent',
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: isDone ? '#111' : isCurrent ? '#555' : '#CCC', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#111', fontVariantNumeric: 'tabular-nums' }}>{os.Id_Ordem}</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#111' }}>{os.Os_Cliente?.split(' ').slice(0, 5).join(' ')}</span>
                      {os.Cidade_Cliente && <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{os.Cidade_Cliente}</span>}
                      {os.Qtd_HR && <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{os.Qtd_HR}h</span>}
                      {d.osCompartilhada[os.Id_Ordem] && (
                        <span style={{
                          fontSize: 12, fontWeight: 800, color: '#7C3AED', background: '#EDE9FE',
                          padding: '3px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4,
                          border: '1.5px solid #C4B5FD',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                          {d.osCompartilhada[os.Id_Ordem].split(' ')[0]}
                        </span>
                      )}
                      <div style={{ flex: 1 }} />
                      {isDone && <span style={{ fontSize: 13, fontWeight: 800, color: '#111', background: '#E8E8E8', padding: '3px 12px', borderRadius: 4 }}>Concluido</span>}
                      {isCurrent && !isDone && gps?.chegada && <span style={{ fontSize: 13, fontWeight: 800, color: '#111', background: '#E8E8E8', padding: '3px 12px', borderRadius: 4 }}>No cliente</span>}
                      {isCurrent && !isDone && !gps?.chegada && foraLoja && <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>A caminho</span>}
                      {temAtraso && <span style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', background: '#FEF2F2', padding: '3px 10px', borderRadius: 4 }}>Excedeu</span>}
                      {chegouAtrasado && <span style={{ fontSize: 13, fontWeight: 800, color: '#DC2626', background: '#FEF2F2', padding: '3px 10px', borderRadius: 4 }}>Atrasado</span>}
                    </div>

                    {/* Endereço editável */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, marginLeft: 15 }}>
                      <MapPin size={14} color="#111" />
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                          <input value={editingAddr!.value}
                            onChange={e => setEditingAddr({ id: editingAddr!.id, value: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Enter') salvarEndereco(); if (e.key === 'Escape') setEditingAddr(null) }}
                            autoFocus style={{ flex: 1, padding: '5px 10px', borderRadius: 5, fontSize: 12, border: '1px solid #DDD', outline: 'none', color: '#111' }} />
                          <button onClick={salvarEndereco} disabled={savingAddr}
                            style={{ background: '#111', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                            {savingAddr ? <RefreshCw size={10} className="animate-spin" /> : 'Salvar'}
                          </button>
                          <button onClick={() => setEditingAddr(null)}
                            style={{ background: '#F0F0F0', color: '#999', border: 'none', borderRadius: 5, padding: '4px 8px', cursor: 'pointer' }}><X size={11} /></button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: 15, fontWeight: 500, color: '#111', flex: 1 }}>{agItem?.endereco || os.Endereco_Cliente || 'Sem endereco'}</span>
                          {agItem && (
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              <button onClick={async () => {
                                try {
                                  const r = await fetch('/api/pos/agenda-visao', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: agItem.id, endereco: ENDERECO_OFICINA }) })
                                  if (r.ok) { const u = await r.json(); setAgenda(p => p.map(a => a.id === agItem.id ? u : a)) }
                                } catch { }
                              }}
                                style={{ background: '#111', border: 'none', cursor: 'pointer', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                                Oficina
                              </button>
                              <button onClick={() => setEditingAddr({ id: agItem.id, value: agItem.endereco || os.Endereco_Cliente || '' })}
                                style={{ background: '#F0F0F0', border: 'none', cursor: 'pointer', color: '#666', padding: '4px 10px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                                <Edit3 size={11} /> Editar
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {isCurrent && !isDone && gps?.chegada && pos && addr && (
                      <div style={{ marginLeft: 15, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: '#111', background: '#F0F0F0', padding: '8px 12px', borderRadius: 6, border: '1px solid #DDD' }}>
                        <Navigation size={14} color="#111" style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, fontWeight: 500 }}>Veículo: <span style={{ fontWeight: 700 }}>{addr}</span></span>
                        <a href={`https://www.google.com/maps?q=${pos.lat},${pos.lng}`} target="_blank" rel="noopener noreferrer"
                          style={{ color: '#111', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 700 }}>
                          <ExternalLink size={11} /> mapa
                        </a>
                      </div>
                    )}

                    {/* Times */}
                    {(() => {
                      // Determinar nomes para os headers
                      const origemNome = osIdx === 0 ? 'oficina' : (() => {
                        const prevOS = ordsTec[osIdx - 1]
                        const prevCli = prevOS?.Os_Cliente?.split(' ').slice(0, 3).join(' ') || ''
                        return prevCli || 'anterior'
                      })()
                      const clienteNome = os.Os_Cliente?.split(' ').slice(0, 3).join(' ') || 'cliente'
                      const temRetorno = (prevAdj?.retorno != null) || est?.retorno != null || !!gps?.retorno
                      return (
                    <div style={{ marginLeft: 15, background: '#F5F5F5', borderRadius: 8, padding: '12px 14px', border: '1px solid #DDD' }}>
                      {/* Header colunas */}
                      <div style={{ display: 'flex', alignItems: 'center', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #E5E5E5' }}>
                        <span style={{ width: 72 }}></span>
                        <span style={{ width: 52, textAlign: 'center', lineHeight: 1.2 }}>Saída de<br /><span style={{ color: '#555', fontWeight: 800 }}>{origemNome}</span></span>
                        <span style={{ width: 20 }}></span>
                        <span style={{ width: 62, textAlign: 'center', lineHeight: 1.2 }}>Chegada em<br /><span style={{ color: '#555', fontWeight: 800 }}>{clienteNome}</span></span>
                        <span style={{ width: 20 }}></span>
                        <span style={{ width: 52, textAlign: 'center', lineHeight: 1.2 }}>Final do<br /><span style={{ color: '#555', fontWeight: 800 }}>serviço</span></span>
                        {temRetorno && <>
                          <span style={{ width: 20 }}></span>
                          <span style={{ width: 52, textAlign: 'center', lineHeight: 1.2 }}>Retorno<br /><span style={{ color: '#555', fontWeight: 800 }}>oficina</span></span>
                        </>}
                      </div>
                      {/* Previsão */}
                      {prevAdj && (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 16, fontVariantNumeric: 'tabular-nums', marginBottom: 6, background: '#DBEAFE', padding: '6px 10px', borderRadius: 5, border: '2px solid #93C5FD' }}>
                          <span style={{ width: 72, fontSize: 12, fontWeight: 800, color: '#1E3A5F' }}>Previsão</span>
                          <span style={{ width: 52, fontWeight: 800, color: '#1E3A5F', textAlign: 'center' }}>{fh(prevAdj.saida)}</span>
                          <span style={{ width: 20, textAlign: 'center', color: '#1E3A5F' }}>&rarr;</span>
                          <span style={{ width: 52, fontWeight: 800, color: '#1E3A5F', textAlign: 'center' }}>{fh(prevAdj.chegada)}</span>
                          <span style={{ width: 20, textAlign: 'center', color: '#1E3A5F' }}>&rarr;</span>
                          <span style={{ width: 52, fontWeight: 800, color: '#1E3A5F', textAlign: 'center' }}>{fh(prevAdj.fim)}</span>
                          {prevAdj.retorno != null && <><span style={{ width: 20, textAlign: 'center', color: '#1E3A5F' }}>&rarr;</span><span style={{ width: 52, fontWeight: 800, color: '#1E3A5F', textAlign: 'center' }}>{fh(prevAdj.retorno)}</span></>}
                          {os.Qtd_HR && <span style={{ fontSize: 13, fontWeight: 700, color: '#1E3A5F', marginLeft: 8 }}>{os.Qtd_HR}h</span>}
                        </div>
                      )}
                      {/* Estimativa */}
                      {est && (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 16, fontVariantNumeric: 'tabular-nums', marginBottom: 6, background: '#FEF9C3', padding: '6px 10px', borderRadius: 5, border: '2px solid #FDE68A' }}>
                          <span style={{ width: 72, fontSize: 12, fontWeight: 800, color: '#92400E' }}>Estimativa</span>
                          <span style={{ width: 52, fontWeight: 800, color: '#92400E', textAlign: 'center' }}>{fh(est.saida)}</span>
                          <span style={{ width: 20, textAlign: 'center', color: '#92400E' }}>&rarr;</span>
                          <span style={{ width: 52, fontWeight: 800, color: '#92400E', textAlign: 'center' }}>{fh(est.chegada)}</span>
                          <span style={{ width: 20, textAlign: 'center', color: '#92400E' }}>&rarr;</span>
                          <span style={{ width: 52, fontWeight: 800, color: '#92400E', textAlign: 'center' }}>{fh(est.fimServico)}</span>
                          {est.retorno != null && <><span style={{ width: 20, textAlign: 'center', color: '#92400E' }}>&rarr;</span><span style={{ width: 52, fontWeight: 800, color: '#92400E', textAlign: 'center' }}>{fh(est.retorno)}</span></>}
                        </div>
                      )}
                      {/* GPS Real */}
                      {gps && (gps.saida || gps.chegada) && (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 16, fontVariantNumeric: 'tabular-nums', marginBottom: 6, background: gps.naoConfirmada ? '#FEF2F2' : '#ECFDF5', padding: '6px 10px', borderRadius: 5, border: `2px solid ${gps.naoConfirmada ? '#FECACA' : '#A7F3D0'}` }}>
                          <span style={{ width: 72, fontSize: 12, fontWeight: 800, color: gps.naoConfirmada ? '#991B1B' : '#065F46' }}>
                            GPS Real
                            {gps.semCoordenadas && (
                              <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#B45309' }}>
                                sem coord.
                              </span>
                            )}
                            {gps.distanciaCliente != null && (
                              <span style={{ display: 'block', fontSize: 10, fontWeight: 600, color: gps.distanciaCliente > 5 ? '#DC2626' : '#059669' }}>
                                {gps.distanciaCliente.toFixed(1)}km
                              </span>
                            )}
                          </span>
                          <span style={{ width: 52, fontWeight: 800, color: '#065F46', textAlign: 'center' }}>{fHora(gps.saida)}</span>
                          <span style={{ width: 20, textAlign: 'center', color: '#065F46' }}>&rarr;</span>
                          <span style={{ width: 52, fontWeight: 800, color: chegouAtrasado ? '#DC2626' : '#065F46', textAlign: 'center' }}>{fHora(gps.chegada)}</span>
                          <span style={{ width: 20, textAlign: 'center', color: '#065F46' }}>&rarr;</span>
                          <span style={{ width: 52, fontWeight: 800, color: temAtraso ? '#DC2626' : '#065F46', textAlign: 'center' }}>{fHora(gps.saidaCliente)}</span>
                          {gps.retorno && <><span style={{ width: 20, textAlign: 'center', color: '#065F46' }}>&rarr;</span><span style={{ width: 52, fontWeight: 800, color: '#065F46', textAlign: 'center' }}>{fHora(gps.retorno)}</span></>}
                        </div>
                      )}
                      {agItem && agItem.tempo_ida_min > 0 && !gps && (
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginTop: 2 }}>{fm(agItem.tempo_ida_min)} / {agItem.distancia_ida_km}km</div>
                      )}
                      {/* Diferenças prev vs GPS */}
                      {prevAdj && gps && (gps.saida || gps.chegada) && (
                        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 13, flexWrap: 'wrap' }}>
                          {[
                            { label: 'Saída', p: prevAdj.saida, r: gps.saida },
                            { label: 'Chegada', p: prevAdj.chegada, r: gps.chegada },
                            { label: 'Fim', p: prevAdj.fim, r: gps.saidaCliente },
                            ...(prevAdj.retorno != null && gps.retorno ? [{ label: 'Retorno', p: prevAdj.retorno, r: gps.retorno }] : []),
                          ].map((dd, di) => {
                            if (!dd.r) return null
                            const diff = isoToMin(dd.r) - dd.p
                            if (Math.abs(diff) <= 5) return null
                            return <span key={di} style={{ fontWeight: 800, color: diff > 0 ? '#DC2626' : '#059669' }}>{dd.label} {diff > 0 ? '+' : ''}{diff > 0 ? fm(diff) : '-' + fm(Math.abs(diff))}</span>
                          })}
                        </div>
                      )}
                    </div>
                      )})()}
                  </div>
                )
              }) })()}

              {viagem?.retorno_loja && lastEst?.retorno && (
                <div style={{ padding: '14px 24px', borderTop: '2px solid #111', display: 'flex', alignItems: 'center', gap: 10, fontSize: 17 }}>
                  <Home size={16} color="#111" />
                  <span style={{ fontWeight: 800, color: '#111' }}>Retornou {fHora(viagem.retorno_loja)}</span>
                  {(() => { const diff = isoToMin(viagem.retorno_loja!) - lastEst.retorno!; return diff > 5 ? <span style={{ color: '#DC2626', fontWeight: 800 }}>+{fm(diff)}</span> : diff < -5 ? <span style={{ color: '#059669', fontWeight: 800 }}>{fm(Math.abs(diff))} antes</span> : <span style={{ color: '#111', fontWeight: 600 }}>pontual</span> })()}
                  <span style={{ color: '#111', fontWeight: 500 }}>est. {fh(lastEst.retorno)}</span>
                </div>
              )}

              {/* Na oficina após retorno */}
              {d.naOficinaAposRetorno && (
                <div style={{ padding: '14px 24px', borderTop: '1px solid #DDD', background: '#F0F4FF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 16, marginBottom: editOficina?.tecnico === modalTec ? 10 : 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1E3A5F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Home size={15} color="#fff" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, color: '#1E3A5F' }}>Na oficina</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#3B82F6' }}>{d.naOficinaAposRetorno.de} → {d.naOficinaAposRetorno.ate}</div>
                    </div>
                    {editOficina?.tecnico !== modalTec && (
                      <button onClick={() => setEditOficina({ tecnico: modalTec!, texto: atividadeOficina[modalTec!] || '' })}
                        style={{ background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Edit3 size={13} /> {atividadeOficina[modalTec!] ? 'Editar' : 'Registrar atividade'}
                      </button>
                    )}
                  </div>
                  {atividadeOficina[modalTec!] && editOficina?.tecnico !== modalTec && (
                    <div style={{ marginTop: 8, marginLeft: 44, fontSize: 15, fontWeight: 600, color: '#1E3A5F', lineHeight: 1.5, background: '#DBEAFE', padding: '10px 14px', borderRadius: 8 }}>
                      {atividadeOficina[modalTec!]}
                    </div>
                  )}
                  {editOficina?.tecnico === modalTec && (
                    <div style={{ marginLeft: 44 }}>
                      <textarea
                        autoFocus
                        value={editOficina.texto}
                        onChange={e => setEditOficina({ ...editOficina, texto: e.target.value })}
                        placeholder="O que o técnico está fazendo na oficina? Ex: Organizando ferramentas, limpeza, preparando peças..."
                        style={{
                          width: '100%', minHeight: 70, padding: '10px 12px', borderRadius: 8,
                          border: '2px solid #93C5FD', fontSize: 14, lineHeight: 1.5, color: '#111',
                          resize: 'vertical', outline: 'none', fontFamily: 'inherit', background: '#fff',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => salvarAtividadeOficina(modalTec!, editOficina.texto)}
                          disabled={savingOficina}
                          style={{ background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                          {savingOficina ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Salvar
                        </button>
                        <button onClick={() => setEditOficina(null)}
                          style={{ background: '#E8E8E8', color: '#666', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {vinculo && !viagem && !gpsLoading && (
                <div style={{ padding: '12px 24px', borderTop: '1px solid #DDD', fontSize: 15, fontWeight: 600, color: '#111' }}>{vinculo.placa} — Sem dados GPS hoje</div>
              )}

              {/* ── RESUMO ── */}
              <div style={{ padding: '16px 24px', borderTop: '2px solid #111' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: '.04em' }}>Resumo do dia</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setResumoTec(gerarResumoAuto(d))}
                      style={{ background: '#E8E8E8', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#111', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <RefreshCw size={13} /> Auto
                    </button>
                    <button onClick={salvarResumo} disabled={savingResumo}
                      style={{ background: '#111', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {savingResumo ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />} Salvar
                    </button>
                  </div>
                </div>
                <textarea
                  value={resumoTec}
                  onChange={e => setResumoTec(e.target.value)}
                  placeholder="Ex: Técnico saiu às 08:30, chegou no cliente X às 09:15..."
                  style={{
                    width: '100%', minHeight: 90, padding: '12px 14px', borderRadius: 8,
                    border: '1px solid #111', fontSize: 16, lineHeight: 1.6, color: '#111',
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                    background: '#FAFAFA', fontWeight: 500,
                  }}
                  onFocus={e => { e.target.style.borderColor = '#111' }}
                  onBlur={e => { e.target.style.borderColor = '#DDD' }}
                />
              </div>

              <div style={{ height: 8 }} />
            </div>
          </div>
        )
      })()}
    </>
  )
}
