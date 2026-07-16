// =============================================================================
// GPS — helpers de desenho de trajeto (client-safe, sem dependências).
// Usados pelo MapaCarros (supervisor + /frota/mapa) e pelo mini-mapa da Ficha
// do Veículo — a régua anti-"linha fantasma" é UMA só.
// =============================================================================

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
