import { NextRequest, NextResponse } from 'next/server'
import { normalizarPlaca } from '@/lib/frota/placa'

const API_URL = process.env.ROTAEXATA_API_URL || 'https://api.rotaexata.com.br'
const EMAIL = process.env.ROTAEXATA_EMAIL || ''
const PASSWORD = process.env.ROTAEXATA_PASSWORD || ''

// Coordenadas da loja (fallback se não encontrar nos destinos)
const LOJA_LAT = -23.2085
const LOJA_LNG = -49.3710
const RAIO_LOJA_KM = 0.8

let tokenCache: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
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

async function fetchRotaExata(endpoint: string, params?: Record<string, string>): Promise<any> {
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

// ── Destinos (pontos de interesse cadastrados na Rota Exata) ──
interface Destino {
  id: number; nome: string; latitude: number; longitude: number
  raio: number; tipo_local: string[]; endereco: string; cnpj: string
}

let destinosCache: { destinos: Destino[]; fetchedAt: number } | null = null

async function getDestinos(): Promise<Destino[]> {
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
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function naLoja(lat: number, lng: number): boolean {
  return distanciaKm(lat, lng, LOJA_LAT, LOJA_LNG) <= RAIO_LOJA_KM
}

// Encontra o destino mais próximo dentro do raio
function findDestino(lat: number, lng: number, destinos: Destino[]): Destino | null {
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

// Verifica se um destino é a loja/oficina
function isDestinoLoja(destino: Destino | null): boolean {
  if (!destino) return false
  const nome = destino.nome.toLowerCase()
  const tipos = destino.tipo_local.map(t => t.toLowerCase())
  return nome.includes('nova tratores') || tipos.some(t => t.includes('base') || t.includes('matriz') || t.includes('sede'))
    || distanciaKm(destino.latitude, destino.longitude, LOJA_LAT, LOJA_LNG) <= RAIO_LOJA_KM
}

// ── Types ──
interface Posicao {
  dt_posicao: string; latitude: number; longitude: number
  velocidade: number; ignicao: number; adesao_id: number
  adesao?: { vei_placa?: string; vei_descricao?: string }
}

interface Evento {
  tipo: 'saida_loja' | 'chegada_cliente' | 'saida_cliente' | 'retorno_loja' | 'parada' | 'inicio_movimento'
  horario: string; lat: number; lng: number; na_loja: boolean
  destino_nome?: string; destino_cnpj?: string
}

interface Viagem {
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

function detectarViagens(posicoes: Posicao[], destinos: Destino[]): Viagem[] {
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
    // Checa se a primeira posição está na loja (por destino ou hardcoded)
    const dest0 = findDestino(posJornada[0].latitude, posJornada[0].longitude, destinos)
    let prevNaLoja = isDestinoLoja(dest0) || naLoja(posJornada[0].latitude, posJornada[0].longitude)
    let ultimoEventoTs = 0
    let saiuDaLoja = false
    let estaNoCliente = false
    let destinoAtual: Destino | null = null // destino onde o técnico está parado

    for (let i = 1; i < posJornada.length; i++) {
      const pos = posJornada[i]
      const ts = new Date(pos.dt_posicao).getTime()
      const ignicaoLigou = pos.ignicao === 1 && prevIgnicao === 0
      const ignicaoDesligou = pos.ignicao === 0 && prevIgnicao === 1
      const debounceOk = (ts - ultimoEventoTs) > DEBOUNCE_MIN * 60 * 1000

      // Identifica destino mais próximo
      const destProximo = findDestino(pos.latitude, pos.longitude, destinos)
      const estaNaLoja = isDestinoLoja(destProximo) || naLoja(pos.latitude, pos.longitude)

      // Saída da loja
      if (!saiuDaLoja && prevNaLoja && !estaNaLoja && pos.velocidade > 0) {
        eventos.push({ tipo: 'saida_loja', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: false })
        saiuDaLoja = true; ultimoEventoTs = ts
      }
      if (!saiuDaLoja && ignicaoLigou && !estaNaLoja) {
        saiuDaLoja = true
      }

      // Chegada no cliente: ignição desligou fora da loja
      if (saiuDaLoja && !estaNoCliente && ignicaoDesligou && !estaNaLoja && debounceOk) {
        destinoAtual = destProximo // pode ser null se não está perto de nenhum destino cadastrado
        eventos.push({
          tipo: 'chegada_cliente', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: false,
          destino_nome: destProximo?.nome, destino_cnpj: destProximo?.cnpj,
        })
        estaNoCliente = true; ultimoEventoTs = ts
      }

      // Saída do cliente: ignição ligou fora da loja
      if (estaNoCliente && ignicaoLigou && !estaNaLoja && debounceOk) {
        eventos.push({
          tipo: 'saida_cliente', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: false,
          destino_nome: destinoAtual?.nome, destino_cnpj: destinoAtual?.cnpj,
        })
        estaNoCliente = false; destinoAtual = null; ultimoEventoTs = ts
      }

      // Retorno à loja
      if (saiuDaLoja && !prevNaLoja && estaNaLoja) {
        eventos.push({ tipo: 'retorno_loja', horario: pos.dt_posicao, lat: pos.latitude, lng: pos.longitude, na_loja: true })
        saiuDaLoja = false; estaNoCliente = false; destinoAtual = null; ultimoEventoTs = ts
      }

      // Parada genérica (sem destino = posto, semáforo, etc)
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

    // Calcular KM total real percorrido (soma das distâncias entre posições consecutivas com movimento)
    let kmTotal = 0
    for (let i = 1; i < posJornada.length; i++) {
      const prev = posJornada[i - 1]
      const curr = posJornada[i]
      if (curr.velocidade > 0 || prev.velocidade > 0) {
        const d = distanciaKm(prev.latitude, prev.longitude, curr.latitude, curr.longitude)
        if (d < 5) kmTotal += d // ignora saltos GPS > 5km (erro de sinal)
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

/**
 * GET /api/pos/rastreamento
 * acao: 'veiculos' | 'posicoes' | 'viagens' | 'destinos' | 'explorar'
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const acao = searchParams.get('acao') || 'veiculos'

    switch (acao) {
      case 'veiculos': {
        const data = await fetchRotaExata('/adesoes', { limit: '200', page: '0' })
        const veiculos = (data.data || []).map((a: any) => ({
          id: a.id, placa: a.vei_placa || '', descricao: a.vei_descricao || '',
          modelo: a.vei_modelo || '', cor: a.vei_cor || '', ano: a.vei_ano || '',
        }))
        return NextResponse.json(veiculos)
      }

      case 'motoristas': {
        const data = await fetchRotaExata('/motoristas', { limit: '200', page: '0' })
        const motoristas = (data.data || []).map((m: any) => ({
          _id: m._id,
          adesao_id: m.adesao_id,
          motorista_id: m.motorista_id || m.motorista?.id,
          nome: m.motorista?.nome || '',
          modo: m.modo || '',
          dt_inicio: m.dt_inicio,
          final: m.final,
        }))
        return NextResponse.json(motoristas)
      }

      case 'usuarios_motoristas': {
        const data = await fetchRotaExata('/usuarios', { limit: '200', page: '0' })
        const motoristas = (data.data || []).filter((u: any) => u.motorista === 1).map((u: any) => ({
          id: u.id, nome: u.nome || '', cargo: u.cargo || '', cpf: u.cpf || '',
        }))
        return NextResponse.json(motoristas)
      }

      case 'odometros': {
        // Retorna o ultimo odometro de cada veiculo
        const data = await fetchRotaExata('/odometro', { limit: '500', page: '0' })
        const items = data.data || []
        // Agrupar por adesao_id, pegar o mais recente
        const porAdesao: Record<number, any> = {}
        for (const od of items) {
          if (!porAdesao[od.adesao_id] || od.created > porAdesao[od.adesao_id].created) {
            porAdesao[od.adesao_id] = od
          }
        }
        const result = Object.values(porAdesao).map((od: any) => ({
          adesao_id: od.adesao_id,
          km: Math.round(od.odometro_adesao / 1000), // converte metros pra km
          km_rastreador: Math.round((od.odometro_rastreador || 0) / 1000),
          data: od.created ? od.created.split('T')[0] : '',
        }))
        return NextResponse.json(result)
      }

      case 'posicoes': {
        const adesaoId = searchParams.get('adesao_id')
        if (!adesaoId) return NextResponse.json({ error: 'adesao_id obrigatório' }, { status: 400 })

        const limit = searchParams.get('limit') || '2000'
        const dia = searchParams.get('data') || new Date().toISOString().split('T')[0]
        const where = JSON.stringify({
          adesao_id: Number(adesaoId),
          dt_posicao: { $gte: `${dia}T00:00:00.000-03:00`, $lte: `${dia}T23:59:59.999-03:00` }
        })
        const data = await fetchRotaExata('/posicoes', { where, limit, page: '0' })
        const posicoes = Array.isArray(data.data) ? data.data : []
        return NextResponse.json(posicoes)
      }

      case 'viagens': {
        const destinos = await getDestinos()
        const veiculosData = await fetchRotaExata('/adesoes', { limit: '200', page: '0' })
        const adesoes = veiculosData.data || []

        const adesaoIdParam = searchParams.get('adesao_id')
        const diaViagens = searchParams.get('data') || new Date().toISOString().split('T')[0]
        const lista = adesaoIdParam
          ? adesoes.filter((a: any) => String(a.id) === adesaoIdParam)
          : adesoes

        const todasViagens: Viagem[] = []

        for (const adesao of lista) {
          try {
            const where = JSON.stringify({
              adesao_id: adesao.id,
              dt_posicao: { $gte: `${diaViagens}T00:00:00.000-03:00`, $lte: `${diaViagens}T23:59:59.999-03:00` }
            })
            const posData = await fetchRotaExata('/posicoes', { where, limit: '5000', page: '0' })
            const posicoes: Posicao[] = Array.isArray(posData.data) ? posData.data : []
            if (posicoes.length > 0) {
              todasViagens.push(...detectarViagens(posicoes, destinos))
            }
          } catch { /* ignora */ }
        }

        return NextResponse.json(todasViagens)
      }

      case 'destinos': {
        const destinos = await getDestinos()
        return NextResponse.json(destinos)
      }

      case 'veiculos_mapa': {
        const vData = await fetchRotaExata('/adesoes', { limit: '200', page: '0' })
        const adesoesList = vData.data || []

        const agora = new Date()
        // Posicoes do dia inteiro pra detectar paradas
        const inicioDia = new Date(agora)
        inicioDia.setHours(0, 0, 0, 0)

        const BATCH = 10
        const veiculosMapa: any[] = []

        for (let i = 0; i < adesoesList.length; i += BATCH) {
          const batch = adesoesList.slice(i, i + BATCH)
          const results = await Promise.all(batch.map(async (ad: any) => {
            const veiculo: any = {
              id: ad.id,
              placa: normalizarPlaca(ad.vei_placa),
              modelo: ad.vei_modelo || ad.vei_descricao || '',
              cor: ad.vei_cor || '',
              ano: ad.vei_ano || '',
              motorista: '',
              lat: null, lng: null, ignicao: false, velocidade: 0,
              dt_posicao: null,
              paradas_hoje: [],
            }
            try {
              const w = JSON.stringify({
                adesao_id: ad.id,
                dt_posicao: { $gte: inicioDia.toISOString(), $lte: agora.toISOString() }
              })
              const posData = await fetchRotaExata('/posicoes', { where: w, limit: '500', page: '0' })
              const posicoes = (Array.isArray(posData.data) ? posData.data : [])
                .sort((a: any, b: any) => new Date(a.dt_posicao).getTime() - new Date(b.dt_posicao).getTime())

              veiculo.pontos_hoje = posicoes.length

              if (posicoes.length > 0) {
                const last = posicoes[posicoes.length - 1]
                veiculo.lat = last.latitude
                veiculo.lng = last.longitude
                veiculo.ignicao = last.ignicao === 1
                veiculo.velocidade = last.velocidade || 0
                veiculo.dt_posicao = last.dt_posicao

                // Status GPS
                const minDesdeUltima = Math.round((agora.getTime() - new Date(last.dt_posicao).getTime()) / 60000)
                if (minDesdeUltima < 5) veiculo.status = 'Online'
                else if (minDesdeUltima < 30) veiculo.status = `${minDesdeUltima}min atrás`
                else veiculo.status = 'Offline'

                // Tempo ligado hoje (somar intervalos com ignição = 1)
                let tempoLigado = 0
                for (let p = 1; p < posicoes.length; p++) {
                  if (posicoes[p - 1].ignicao === 1) {
                    const diff = new Date(posicoes[p].dt_posicao).getTime() - new Date(posicoes[p - 1].dt_posicao).getTime()
                    if (diff > 0 && diff < 30 * 60 * 1000) {
                      tempoLigado += diff
                    }
                  }
                }
                veiculo.tempo_ligado_min = Math.round(tempoLigado / 60000)
              } else {
                veiculo.status = 'Sem sinal'
                veiculo.tempo_ligado_min = 0
              }

              // Detectar paradas: ignição desligada por >5min no mesmo ponto
              let paradaInicio: any = null
              for (const pos of posicoes) {
                if (pos.ignicao === 0 && pos.velocidade === 0) {
                  if (!paradaInicio) paradaInicio = pos
                } else {
                  if (paradaInicio) {
                    const durMin = Math.round((new Date(pos.dt_posicao).getTime() - new Date(paradaInicio.dt_posicao).getTime()) / 60000)
                    if (durMin >= 5) {
                      veiculo.paradas_hoje.push({
                        lat: paradaInicio.latitude,
                        lng: paradaInicio.longitude,
                        inicio: paradaInicio.dt_posicao,
                        fim: pos.dt_posicao,
                        duracao_min: durMin,
                      })
                    }
                    paradaInicio = null
                  }
                }
              }
              // Parada ainda em andamento
              if (paradaInicio) {
                const durMin = Math.round((agora.getTime() - new Date(paradaInicio.dt_posicao).getTime()) / 60000)
                if (durMin >= 5) {
                  veiculo.paradas_hoje.push({
                    lat: paradaInicio.latitude,
                    lng: paradaInicio.longitude,
                    inicio: paradaInicio.dt_posicao,
                    fim: null,
                    duracao_min: durMin,
                  })
                }
              }
            } catch { /* sem posicao */ }
            return veiculo
          }))
          veiculosMapa.push(...results)
        }

        return NextResponse.json(veiculosMapa)
      }

      case 'explorar': {
        const token = await getToken()
        const results: Record<string, any> = {}

        const adesaoRes = await fetch(`${API_URL}/adesoes?limit=10&page=0`, { headers: { Authorization: token } })
        const adesaoBody = await adesaoRes.json()
        const adesoes = adesaoBody.data || []
        results['veiculos'] = adesoes.map((a: any) => ({
          id: a.id, placa: a.vei_placa, descricao: a.vei_descricao,
        }))

        for (const ad of adesoes.slice(0, 5)) {
          const key = `${ad.vei_placa} (${ad.vei_descricao || ad.id})`
          try {
            const w = encodeURIComponent(JSON.stringify({ adesao_id: ad.id }))
            const r = await fetch(`${API_URL}/posicoes?where=${w}&limit=5&page=0`, { headers: { Authorization: token } })
            if (r.status === 404) {
              results[key] = { status: 404, msg: 'Sem posições' }
              continue
            }
            const body = await r.json()
            const arr = Array.isArray(body.data) ? body.data : []
            if (arr.length > 0) {
              const first = arr[0]
              const last = arr[arr.length - 1]
              results[key] = {
                total: arr.length,
                ultima_data: last.dt_posicao,
                primeira_data: first.dt_posicao,
                ignicao: last.ignicao,
                velocidade: last.velocidade,
                lat: last.latitude,
                lng: last.longitude,
                na_loja: naLoja(last.latitude, last.longitude),
              }
            } else {
              results[key] = { total: 0, msg: 'Vazio' }
            }
          } catch (e: any) {
            results[key] = { erro: e.message }
          }
        }

        return NextResponse.json(results)
      }

      default:
        return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 })
    }
  } catch (err: any) {
    console.error('[Rastreamento]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/pos/rastreamento
 * acao: 'vincular_motorista'
 * body: { adesao_id, motorista_id }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const acao = body.acao

    if (acao === 'vincular_motorista') {
      const { adesao_id, motorista_id } = body
      if (!adesao_id || !motorista_id) {
        return NextResponse.json({ error: 'adesao_id e motorista_id obrigatórios' }, { status: 400 })
      }

      const token = await getToken()
      const res = await fetch(`${API_URL}/motoristas`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adesao_id, motorista_id }),
      })

      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Rota Exata: ${res.status} - ${text}` }, { status: res.status })
      }

      const data = await res.json()
      return NextResponse.json(data)
    }

    if (acao === 'desvincular_motorista') {
      const { vinculo_id } = body
      if (!vinculo_id) {
        return NextResponse.json({ error: 'vinculo_id obrigatório' }, { status: 400 })
      }

      const token = await getToken()
      const res = await fetch(`${API_URL}/motoristas/${vinculo_id}`, {
        method: 'DELETE',
        headers: { Authorization: token },
      })

      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Rota Exata: ${res.status} - ${text}` }, { status: res.status })
      }

      const data = await res.json()
      return NextResponse.json(data)
    }

    if (acao === 'atualizar_odometro') {
      const { adesao_id, km } = body
      if (!adesao_id || km == null) {
        return NextResponse.json({ error: 'adesao_id e km obrigatórios' }, { status: 400 })
      }

      const token = await getToken()
      const res = await fetch(`${API_URL}/odometro`, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ adesao_id, odometro_adesao: km }), // API espera km, converte pra metros internamente
      })

      if (!res.ok) {
        const text = await res.text()
        return NextResponse.json({ error: `Rota Exata: ${res.status} - ${text}` }, { status: res.status })
      }

      const data = await res.json()
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: `Ação desconhecida: ${acao}` }, { status: 400 })
  } catch (err: any) {
    console.error('[Rastreamento POST]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
