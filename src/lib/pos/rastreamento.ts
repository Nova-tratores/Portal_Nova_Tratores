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

// =============================================
// Rota de UM carro num dia: caminho + paradas + km.
// Lê do banco (rotas_vendedor) se já salva; senão busca na Rota Exata,
// calcula e salva (quando é dia passado). Reutilizado pela API e pelo cron.
// =============================================
export interface RotaDia {
  placa: string
  data: string
  pontos: { lat: number; lng: number; dt: string; ignicao: number; vel: number }[]
  paradas: { lat: number; lng: number; inicio: string; fim: string | null; duracao_min: number }[]
  km_total: number
  hora_inicio: string | null
  hora_fim: string | null
  tempo_dirigindo_min: number
  tempo_parado_min: number
  // Visitas do dia feitas a até 2km de alguma parada do carro (cruzamento rota×visitas)
  visitas: { id: any; vendedor_nome: string; cliente_nome: string; tipo: string; data_visita: string; lat: number; lng: number; dist_parada_km: number }[]
}

export async function computarESalvarRota(
  supabase: any,
  placa: string,
  data: string,
): Promise<RotaDia> {
  const hoje = new Date().toISOString().split('T')[0]

  // 1) Rota já salva?
  const { data: rotaSalva } = await supabase
    .from('rotas_vendedor')
    .select('*')
    .eq('placa', placa)
    .eq('data', data)
    .maybeSingle()
  if (rotaSalva && Array.isArray(rotaSalva.pontos) && rotaSalva.pontos.length > 0) {
    return rotaSalva as RotaDia
  }

  // 2) Achar o veículo na Rota Exata pela placa
  const vData = await fetchRotaExata('/adesoes', { limit: '200', page: '0' })
  const placaNorm = placa.replace(/[-\s]/g, '').toUpperCase()
  const ad = (vData.data || []).find(
    (a: any) => (a.vei_placa || '').replace(/[-\s]/g, '').toUpperCase() === placaNorm,
  )
  if (!ad) return { placa, data, pontos: [], paradas: [], km_total: 0, hora_inicio: null, hora_fim: null, tempo_dirigindo_min: 0, tempo_parado_min: 0, visitas: [] }

  // Vínculo do carro (pessoa/vendedor) — usado no cruzamento de visitas e na gravação
  const { data: vinc } = await supabase
    .from('comercial_veiculos')
    .select('pessoa_id, pessoa_nome, vinculo_tipo')
    .eq('placa', placa)
    .maybeSingle()

  // 3) Posições do dia
  const inicio = `${data}T00:00:00.000Z`
  const fim = data === hoje ? new Date().toISOString() : `${data}T23:59:59.000Z`
  const w = JSON.stringify({ adesao_id: ad.id, dt_posicao: { $gte: inicio, $lte: fim } })
  const posData = await fetchRotaExata('/posicoes', { where: w, limit: '1000', page: '0' })
  const posicoes = (Array.isArray(posData.data) ? posData.data : [])
    .sort((a: any, b: any) => new Date(a.dt_posicao).getTime() - new Date(b.dt_posicao).getTime())

  const pontos = posicoes.map((p: any) => ({ lat: p.latitude, lng: p.longitude, dt: p.dt_posicao, ignicao: p.ignicao, vel: p.velocidade }))

  // km (haversine, ignora saltos > 5km de erro de GPS)
  let kmTotal = 0
  for (let i = 1; i < pontos.length; i++) {
    const d = distanciaKm(pontos[i - 1].lat, pontos[i - 1].lng, pontos[i].lat, pontos[i].lng)
    if (d < 5) kmTotal += d
  }

  // paradas (ignição 0 + velocidade 0 por >= 5 min)
  const paradas: RotaDia['paradas'] = []
  let pIni: any = null
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
  const tempo_dirigindo_min = Math.round(dirigindoMs / 60000)
  const tempo_parado_min = paradas.reduce((s, p) => s + (p.duracao_min || 0), 0)

  // Cruzamento rota × visitas: visitas do dia feitas a até 2km de alguma parada.
  // Se o carro é de um vendedor, restringe às visitas dele; senão, casa por proximidade.
  const visitas: RotaDia['visitas'] = []
  if (paradas.length > 0) {
    try {
      const proxDia = new Date(`${data}T00:00:00`)
      proxDia.setDate(proxDia.getDate() + 1)
      const fimData = proxDia.toISOString().split('T')[0]
      let vq = supabase
        .from('vw_visitas_detalhadas')
        .select('id, vendedor_id, vendedor_nome, cliente_nome, tipo, data_visita, latitude, longitude')
        .gte('data_visita', data)
        .lt('data_visita', fimData)
        .not('latitude', 'is', null)
      if (vinc?.vinculo_tipo === 'vendedor' && vinc?.pessoa_id) vq = vq.eq('vendedor_id', vinc.pessoa_id)
      const { data: vis } = await vq
      for (const v of vis || []) {
        const vlat = Number(v.latitude), vlng = Number(v.longitude)
        if (!vlat || !vlng) continue
        let melhor = Infinity
        for (const p of paradas) { const d = distanciaKm(p.lat, p.lng, vlat, vlng); if (d < melhor) melhor = d }
        if (melhor <= 2) {
          visitas.push({
            id: v.id, vendedor_nome: v.vendedor_nome || '', cliente_nome: v.cliente_nome || '',
            tipo: v.tipo || '', data_visita: v.data_visita, lat: vlat, lng: vlng,
            dist_parada_km: Math.round(melhor * 100) / 100,
          })
        }
      }
    } catch { /* sem visitas */ }
  }

  const rota: RotaDia = {
    placa, data, pontos, paradas, km_total: Math.round(kmTotal),
    hora_inicio: pontos.length > 0 ? pontos[0].dt : null,
    hora_fim: pontos.length > 0 ? pontos[pontos.length - 1].dt : null,
    tempo_dirigindo_min, tempo_parado_min, visitas,
  }

  // 4) Salva histórico (dia passado, com pontos) — inclui as visitas cruzadas
  if (data !== hoje && pontos.length > 0) {
    await supabase.from('rotas_vendedor').upsert({
      ...rota,
      vendedor_id: vinc?.pessoa_id || null,
      vendedor_nome: vinc?.pessoa_nome || null,
    }, { onConflict: 'placa,data' })
  }

  return rota
}
