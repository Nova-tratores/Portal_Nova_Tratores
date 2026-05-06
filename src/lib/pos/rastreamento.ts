// =============================================
// Lógica compartilhada de rastreamento GPS (Rota Exata)
// Usada por: /api/pos/rastreamento e /api/pos/cron/gravar-gps
// =============================================

const API_URL = process.env.ROTAEXATA_API_URL || 'https://api.rotaexata.com.br'
const EMAIL = process.env.ROTAEXATA_EMAIL || ''
const PASSWORD = process.env.ROTAEXATA_PASSWORD || ''

export const LOJA_LAT = -23.2085
export const LOJA_LNG = -49.3710
export const RAIO_LOJA_KM = 0.8

let tokenCache: { token: string; expiresAt: number } | null = null

export async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token
  }
  const res = await fetch(`${API_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`Login Rota Exata falhou: ${res.status}`)
  const data = await res.json()
  if (!data.token) throw new Error('Login Rota Exata: token não retornado')
  tokenCache = { token: data.token, expiresAt: Date.now() + 50 * 60 * 1000 }
  return data.token
}

export async function fetchRotaExata(endpoint: string, params?: Record<string, string>): Promise<any> {
  const token = await getToken()
  let url = `${API_URL}${endpoint}`
  if (params) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    url += `?${qs}`
  }
  const res = await fetch(url, { headers: { Authorization: token } })
  if (res.status === 404) return { data: [] }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Rota Exata ${endpoint}: ${res.status} - ${text}`)
  }
  return res.json()
}

// ── Destinos ──
export interface Destino {
  id: number; nome: string; latitude: number; longitude: number
  raio: number; tipo_local: string[]; endereco: string; cnpj: string
}

let destinosCache: { destinos: Destino[]; fetchedAt: number } | null = null

export async function getDestinos(): Promise<Destino[]> {
  if (destinosCache && Date.now() - destinosCache.fetchedAt < 60 * 60 * 1000) {
    return destinosCache.destinos
  }
  try {
    const data = await fetchRotaExata('/destinos', { limit: '500', page: '0' })
    const raw = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : [])
    const destinos: Destino[] = raw.map((d: any) => ({
      id: d.id || d._id, nome: d.nome || '', latitude: d.latitude || 0, longitude: d.longitude || 0,
      raio: d.raio || 500, tipo_local: Array.isArray(d.tipo_local) ? d.tipo_local : [], endereco: d.endereco || '', cnpj: d.cnpj || '',
    }))
    destinosCache = { destinos, fetchedAt: Date.now() }
    return destinos
  } catch {
    return []
  }
}

// ── Geo ──
export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function naLoja(lat: number, lng: number): boolean {
  return distanciaKm(lat, lng, LOJA_LAT, LOJA_LNG) <= RAIO_LOJA_KM
}

export function findDestino(lat: number, lng: number, destinos: Destino[]): Destino | null {
  let melhor: Destino | null = null
  let melhorDist = Infinity
  for (const d of destinos) {
    if (!d.latitude || !d.longitude) continue
    const dist = distanciaKm(lat, lng, d.latitude, d.longitude)
    const raioKm = (d.raio || 500) / 1000
    if (dist <= raioKm && dist < melhorDist) {
      melhor = d; melhorDist = dist
    }
  }
  return melhor
}

export function isDestinoLoja(destino: Destino | null): boolean {
  if (!destino) return false
  const nome = destino.nome.toLowerCase()
  const tipos = destino.tipo_local.map(t => t.toLowerCase())
  return nome.includes('nova tratores') || tipos.some(t => t.includes('base') || t.includes('matriz') || t.includes('sede'))
    || distanciaKm(destino.latitude, destino.longitude, LOJA_LAT, LOJA_LNG) <= RAIO_LOJA_KM
}

// ── Types ──
export interface Posicao {
  dt_posicao: string; latitude: number; longitude: number
  velocidade: number; ignicao: number; adesao_id: number
  adesao?: { vei_placa?: string; vei_descricao?: string }
}

export interface Evento {
  tipo: 'saida_loja' | 'chegada_cliente' | 'saida_cliente' | 'retorno_loja' | 'parada' | 'inicio_movimento'
  horario: string; lat: number; lng: number; na_loja: boolean
  destino_nome?: string; destino_cnpj?: string
}

export interface Viagem {
  adesao_id: number; placa: string; descricao: string; data: string
  saida_loja: string | null; chegada_cliente: string | null
  saida_cliente: string | null; retorno_loja: string | null
  eventos: Evento[]; posicoes_total: number; km_total: number
  ultima_posicao: { dt: string; lat: number; lng: number; ignicao: number; velocidade: number } | null
}

const DEBOUNCE_MIN = 3
const HORA_INICIO_JORNADA = 5

function horaLocal(dt: string): number {
  return new Date(dt).getHours()
}

export function detectarViagens(posicoes: Posicao[], destinos: Destino[]): Viagem[] {
  if (posicoes.length === 0) return []
  const sorted = [...posicoes].sort((a, b) =>
    new Date(a.dt_posicao).getTime() - new Date(b.dt_posicao).getTime()
  )

  const porDia: Record<string, Posicao[]> = {}
  for (const p of sorted) {
    const d = new Date(p.dt_posicao)
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!porDia[dia]) porDia[dia] = []
    porDia[dia].push(p)
  }

  const adesaoId = sorted[0].adesao_id
  const placa = sorted[0].adesao?.vei_placa || ''
  const descricao = sorted[0].adesao?.vei_descricao || ''

  const viagens: Viagem[] = []

  for (const [dia, posDia] of Object.entries(porDia)) {
    if (posDia.length < 2) continue
    const last = posDia[posDia.length - 1]

    const posJornada = posDia.filter(p => horaLocal(p.dt_posicao) >= HORA_INICIO_JORNADA)
    if (posJornada.length < 2) continue

    const eventos: Evento[] = []
    let prevIgnicao = posJornada[0].ignicao
    const dest0 = findDestino(posJornada[0].latitude, posJornada[0].longitude, destinos)
    let prevNaLoja = isDestinoLoja(dest0) || naLoja(posJornada[0].latitude, posJornada[0].longitude)
    let ultimoEventoTs = 0
    let saiuDaLoja = false
    let estaNoCliente = false
    let destinoAtual: Destino | null = null

    for (let i = 1; i < posJornada.length; i++) {
      const pos = posJornada[i]
      const ts = new Date(pos.dt_posicao).getTime()
      const ignicaoLigou = pos.ignicao === 1 && prevIgnicao === 0
      const ignicaoDesligou = pos.ignicao === 0 && prevIgnicao === 1
      const debounceOk = (ts - ultimoEventoTs) > DEBOUNCE_MIN * 60 * 1000

      const destProximo = findDestino(pos.latitude, pos.longitude, destinos)
      const estaNaLoja = isDestinoLoja(destProximo) || naLoja(pos.latitude, pos.longitude)

      if (!saiuDaLoja && prevNaLoja && !estaNaLoja && pos.velocidade > 0) {
        eventos.push({ tipo: 'saida_loja', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: false })
        saiuDaLoja = true; ultimoEventoTs = ts
      }
      if (!saiuDaLoja && ignicaoLigou && !estaNaLoja) {
        saiuDaLoja = true
      }

      if (saiuDaLoja && !estaNoCliente && ignicaoDesligou && !estaNaLoja && debounceOk) {
        destinoAtual = destProximo
        eventos.push({
          tipo: 'chegada_cliente', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: false,
          destino_nome: destProximo?.nome, destino_cnpj: destProximo?.cnpj,
        })
        estaNoCliente = true; ultimoEventoTs = ts
      }

      if (estaNoCliente && ignicaoLigou && !estaNaLoja && debounceOk) {
        eventos.push({
          tipo: 'saida_cliente', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: false,
          destino_nome: destinoAtual?.nome, destino_cnpj: destinoAtual?.cnpj,
        })
        estaNoCliente = false; destinoAtual = null; ultimoEventoTs = ts
      }

      if (saiuDaLoja && !prevNaLoja && estaNaLoja) {
        eventos.push({ tipo: 'retorno_loja', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: true })
        saiuDaLoja = false; estaNoCliente = false; destinoAtual = null; ultimoEventoTs = ts
      }

      if (ignicaoDesligou && !estaNaLoja && !estaNoCliente && saiuDaLoja && debounceOk) {
        eventos.push({
          tipo: 'parada', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: false,
          destino_nome: destProximo?.nome, destino_cnpj: destProximo?.cnpj,
        })
        ultimoEventoTs = ts
      }

      prevIgnicao = pos.ignicao
      prevNaLoja = estaNaLoja
    }

    let kmTotal = 0
    for (let i = 1; i < posJornada.length; i++) {
      const prev = posJornada[i - 1]
      const curr = posJornada[i]
      if (curr.velocidade > 0 || prev.velocidade > 0) {
        const d = distanciaKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
        if (d < 5) kmTotal += d
      }
    }

    viagens.push({
      adesao_id: adesaoId, placa, descricao, data: dia,
      saida_loja: eventos.find(e => e.tipo === 'saida_loja')?.horario || null,
      chegada_cliente: eventos.find(e => e.tipo === 'chegada_cliente')?.horario || null,
      saida_cliente: eventos.filter(e => e.tipo === 'saida_cliente').pop()?.horario || null,
      retorno_loja: eventos.filter(e => e.tipo === 'retorno_loja').pop()?.horario || null,
      eventos, posicoes_total: posDia.length, km_total: Math.round(kmTotal * 10) / 10,
      ultima_posicao: { dt: last.dt_posicao, lat: last.latitude, lng: last.longitude, ignicao: last.ignicao, velocidade: last.velocidade },
    })
  }

  return viagens.sort((a, b) => b.data.localeCompare(a.data))
}
