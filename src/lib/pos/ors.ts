// Nova Tratores - Av. São Sebastião, 1065 - Vila Campos, Piraju - SP
// (pino oficial do Google Maps da loja, passado pelo José em 03/09/2026)
const OFICINA_LAT = -23.2085475
const OFICINA_LNG = -49.3709057

export const OFICINA = { lat: OFICINA_LAT, lng: OFICINA_LNG }

function getOrsKey() {
  return process.env.ORS_API_KEY || process.env.NEXT_PUBLIC_ORS_API_KEY || ''
}

interface RotaResult {
  distancia_km: number
  tempo_min: number
}

/**
 * Geocodifica um endereço usando OpenRouteService
 */
export async function geocodificar(endereco: string): Promise<{ lat: number; lng: number } | null> {
  const ORS_KEY = getOrsKey()
  if (!ORS_KEY || ORS_KEY === 'SUA_CHAVE_AQUI') return null

  try {
    const res = await fetch(
      `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(endereco)}&boundary.country=BR&size=1`,
    )
    if (!res.ok) return null
    const data = await res.json()
    const coords = data.features?.[0]?.geometry?.coordinates
    if (!coords) return null

    return { lat: coords[1], lng: coords[0] }
  } catch {
    return null
  }
}

/**
 * Calcula rota entre dois pontos usando OpenRouteService
 */
export async function calcularRota(
  origemLat: number, origemLng: number,
  destinoLat: number, destinoLng: number,
): Promise<RotaResult | null> {
  const ORS_KEY = getOrsKey()
  if (!ORS_KEY || ORS_KEY === 'SUA_CHAVE_AQUI') return null

  try {
    // POST com radiuses: -1 = encaixa na estrada mais próxima SEM limite de
    // raio (cliente rural manda o pino no meio da fazenda e o GET padrão,
    // que só procura estrada a ~350m, falhava com "não achei rota")
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates: [[origemLng, origemLat], [destinoLng, destinoLat]],
        radiuses: [-1, -1],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const resumo = data.routes?.[0]?.summary
    if (!resumo) return null

    return {
      distancia_km: Math.round((resumo.distance / 1000) * 10) / 10,
      tempo_min: Math.round(resumo.duration / 60),
    }
  } catch {
    return null
  }
}

/**
 * Calcula rota da oficina até um destino
 */
export async function rotaDaOficina(destinoLat: number, destinoLng: number) {
  return calcularRota(OFICINA.lat, OFICINA.lng, destinoLat, destinoLng)
}
