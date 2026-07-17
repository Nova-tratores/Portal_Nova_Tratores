// =============================================================================
// GPS — helpers de trajeto (client-safe, sem dependências de servidor).
// Usados pelo MapaCarros (supervisor + /frota/mapa), pelo mini-mapa da Ficha
// e pelo CÁLCULO de rota do dia (computarESalvarRota + importador do
// histórico do OMIE) — régua de desenho e de cálculo é UMA só.
// =============================================================================
import { agregarIgnicao, type MetricasIgnicao } from './ignicao'

export interface PontoGps {
  lat: number
  lng: number
  dt: string
  vel?: number
  ignicao?: number
}

// Buraco de sinal não é trajeto: pontos consecutivos longe demais (ou com gap
// de tempo) NÃO são ligados por linha cheia — viram conector pontilhado.
export const GAP_KM = 2
export const GAP_MIN = 15
// deslocamento fisicamente impossível entre dois fixes (km/h implícito) —
// pega os saltos CURTOS que passam pelo corte de 2km e viravam risco reto
export const VEL_IMPLICITA_MAX = 160

export function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// "Espeto" de GPS: ponto que salta pra longe e VOLTA (A -> B -> A) é ruído do
// rastreador, não trajeto — desenhava um leque de retas cruzando os bairros.
export function filtrarEspetos<T extends { lat: number; lng: number }>(pontos: T[]): T[] {
  const out: T[] = []
  for (let i = 0; i < pontos.length; i++) {
    const prev = out[out.length - 1]
    const next = pontos[i + 1]
    if (prev && next) {
      const idaKm = distKm(prev, pontos[i])
      const voltaKm = distKm(pontos[i], next)
      const direto = distKm(prev, next)
      if (idaKm > 0.25 && voltaKm > 0.25 && direto < Math.min(idaKm, voltaKm) * 0.5) continue
    }
    out.push(pontos[i])
  }
  return out
}

export interface Buraco {
  de: PontoGps
  ate: PontoGps
  tooltip: string
}

/** Divide o trajeto em segmentos desenháveis + os buracos (pra pontilhado). */
export function segmentarTrajeto(pontos: PontoGps[]): { segmentos: PontoGps[][]; buracos: Buraco[] } {
  const segmentos: PontoGps[][] = []
  const buracos: Buraco[] = []
  let seg: PontoGps[] = []
  for (const p of pontos) {
    if (seg.length > 0) {
      const prev = seg[seg.length - 1]
      const gapKm = distKm(prev, p)
      const gapMin = (new Date(p.dt).getTime() - new Date(prev.dt).getTime()) / 60000
      const velImplicita = gapMin > 0 ? (gapKm / gapMin) * 60 : (gapKm > 0.05 ? Infinity : 0)
      if (gapKm > GAP_KM || gapMin > GAP_MIN || velImplicita > VEL_IMPLICITA_MAX) {
        segmentos.push(seg)
        buracos.push({
          de: prev,
          ate: p,
          tooltip:
            velImplicita > VEL_IMPLICITA_MAX && gapKm <= GAP_KM
              ? `salto de GPS: ${(gapKm * 1000).toFixed(0)}m em ${Math.max(1, Math.round(gapMin * 60))}s`
              : `sem sinal: ${gapKm > GAP_KM ? gapKm.toFixed(1) + ' km' : Math.round(gapMin) + ' min'} sem pontos`,
        })
        seg = []
      }
    }
    seg.push(p)
  }
  if (seg.length > 0) segmentos.push(seg)
  return { segmentos, buracos }
}

// ── Rota do dia a partir dos pontos crus ────────────────────────────────────
// A MESMA conta do computarESalvarRota, extraída pra também servir o
// importador do histórico local (rastreio_pontos_relatorio, do projeto OMIE).

export interface ParadaCalculada {
  lat: number
  lng: number
  inicio: string
  fim: string | null
  duracao_min: number
}

export interface RotaDiaCalculada extends Partial<MetricasIgnicao> {
  placa: string
  data: string
  pontos: PontoGps[]
  paradas: ParadaCalculada[]
  km_total: number
  hora_inicio: string | null
  hora_fim: string | null
  tempo_dirigindo_min: number
  tempo_parado_min: number
}

/** `pontos` já ordenados por dt asc. */
export function construirRotaDia(placa: string, data: string, pontos: PontoGps[]): RotaDiaCalculada {
  // km (haversine, ignora saltos > 5km de erro de GPS)
  let kmTotal = 0
  for (let i = 1; i < pontos.length; i++) {
    const d = distKm(pontos[i - 1], pontos[i])
    if (d < 5) kmTotal += d
  }

  // paradas (ignição 0 + velocidade 0 por >= 5 min)
  const paradas: ParadaCalculada[] = []
  let pIni: PontoGps | null = null
  for (const p of pontos) {
    if (p.ignicao === 0 && p.vel === 0) {
      if (!pIni) pIni = p
    } else if (pIni) {
      const dur = Math.round((new Date(p.dt).getTime() - new Date(pIni.dt).getTime()) / 60000)
      if (dur >= 5) paradas.push({ lat: pIni.lat, lng: pIni.lng, inicio: pIni.dt, fim: p.dt, duracao_min: dur })
      pIni = null
    }
  }

  // tempo dirigindo (intervalos em movimento) e parado (soma das paradas)
  let dirigindoMs = 0
  for (let i = 1; i < pontos.length; i++) {
    const prev = pontos[i - 1]
    const diff = new Date(pontos[i].dt).getTime() - new Date(prev.dt).getTime()
    if (diff > 0 && diff < 30 * 60 * 1000 && prev.ignicao === 1 && (prev.vel || 0) > 0) {
      dirigindoMs += diff
    }
  }

  return {
    placa,
    data,
    pontos,
    paradas,
    km_total: Math.round(kmTotal),
    hora_inicio: pontos.length > 0 ? pontos[0].dt : null,
    hora_fim: pontos.length > 0 ? pontos[pontos.length - 1].dt : null,
    tempo_dirigindo_min: Math.round(dirigindoMs / 60000),
    tempo_parado_min: paradas.reduce((s, p) => s + (p.duracao_min || 0), 0),
    // Ignição (partidas, tempo LIGADO — inclui marcha lenta — etc.).
    // ignicao/vel ausentes viram 0 (desligado/parado) — mesmo efeito do RE.
    ...agregarIgnicao(pontos.map((p) => ({ ...p, ignicao: p.ignicao ?? 0, vel: p.vel ?? 0 }))),
  }
}
