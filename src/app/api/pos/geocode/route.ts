import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

const memCache: Record<string, string> = {}

// Fila para serializar chamadas e respeitar rate limit
let geoQueue: Promise<void> = Promise.resolve()

function enfileirar<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    geoQueue = geoQueue.then(async () => {
      try { resolve(await fn()) } catch (e) { reject(e) }
      await new Promise(r => setTimeout(r, 1100)) // 1.1s entre chamadas
    })
  })
}

async function buscarPhoton(lat: string, lng: string): Promise<string> {
  const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=default`, { headers: { 'User-Agent': 'PortalNovaTratores/1.0' } })
  if (!r.ok) return ''
  const data = await r.json()
  const feat = data.features?.[0]?.properties
  if (!feat) return ''
  const rua = [feat.street || feat.name, feat.housenumber].filter(Boolean).join(', ')
  const bairro = feat.district || feat.locality || ''
  const cidade = feat.city || feat.town || feat.village || feat.county || ''
  const parts = rua
    ? [rua, bairro, cidade].filter(Boolean)
    : [bairro || feat.name, cidade, feat.state].filter(Boolean)
  return parts.join(' — ') || ''
}

async function buscarNominatim(lat: string, lng: string): Promise<string> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
    { headers: { 'User-Agent': 'PortalNovaTratores/1.0', 'Accept-Language': 'pt-BR' } }
  )
  if (!r.ok) return ''
  const data = await r.json()
  const addr = data.address || {}
  const rua = [addr.road || addr.pedestrian || addr.residential || addr.hamlet || addr.farm || addr.isolated_dwelling, addr.house_number].filter(Boolean).join(', ')
  const bairro = addr.suburb || addr.neighbourhood || addr.city_district || ''
  const cidade = addr.city || addr.town || addr.village || addr.municipality || ''
  const parts = rua
    ? [rua, bairro, cidade].filter(Boolean)
    : [bairro, cidade || addr.county, addr.state].filter(Boolean)
  return parts.join(' — ') || data.display_name?.split(',').slice(0, 3).join(',').trim() || ''
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase()
  const lat = req.nextUrl.searchParams.get('lat')
  const lng = req.nextUrl.searchParams.get('lng')
  if (!lat || !lng) return NextResponse.json({ error: 'lat e lng obrigatórios' }, { status: 400 })

  const key = `${parseFloat(lat).toFixed(5)},${parseFloat(lng).toFixed(5)}`

  // 1. Cache em memória
  if (memCache[key]) return NextResponse.json({ endereco: memCache[key] })

  // 2. Cache no Supabase
  try {
    const { data: cached } = await supabase.from('geocode_cache').select('endereco').eq('coordenada', key).single()
    if (cached?.endereco) {
      memCache[key] = cached.endereco
      return NextResponse.json({ endereco: cached.endereco })
    }
  } catch { /* tabela pode não existir */ }

  // 3. Buscar via fila (Photon → Nominatim)
  const endereco = await enfileirar(async () => {
    // Photon primeiro
    let result = ''
    try { result = await buscarPhoton(lat, lng) } catch { /* */ }
    // Nominatim como fallback
    if (!result) {
      try { result = await buscarNominatim(lat, lng) } catch { /* */ }
    }
    return result
  })

  // Salvar no cache
  if (endereco) {
    memCache[key] = endereco
    try { await supabase.from('geocode_cache').upsert({ coordenada: key, endereco, lat: parseFloat(lat), lng: parseFloat(lng) }) } catch { /* */ }
  }

  return NextResponse.json({ endereco })
}
