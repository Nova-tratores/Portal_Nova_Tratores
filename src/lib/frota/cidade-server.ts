// Cidade de um ponto (lat/lng) por geocodificação reversa, com cache ETERNO em geocode_cache (célula de 2 casas
// decimais ≈ 1,1 km): o mesmo pátio/fazenda/posto resolve a cidade UMA vez e nunca mais chama serviço externo.
// Era da rota /api/frota/localizacao; o mapa ao vivo (mapa-vivo-server) usa a mesma (José, 12/11: "coloca no mapa a
// cidade que eles estão"). Só servidor.
import type { SupabaseClient } from '@supabase/supabase-js'

const memCidade: Record<string, string> = {}
const buscando = new Set<string>()
const chave = (lat: number, lng: number) => `cidade:${lat.toFixed(2)},${lng.toFixed(2)}`

async function cidadePhoton(lat: number, lng: number): Promise<string> {
  const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=default`, {
    headers: { 'User-Agent': 'PortalNovaTratores/1.0' },
    signal: AbortSignal.timeout(6_000),
  })
  if (!r.ok) return ''
  const feat = (await r.json()).features?.[0]?.properties
  return feat?.city || feat?.town || feat?.village || feat?.county || ''
}

async function cidadeNominatim(lat: number, lng: number): Promise<string> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
    { headers: { 'User-Agent': 'PortalNovaTratores/1.0', 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(6_000) },
  )
  if (!r.ok) return ''
  const addr = (await r.json()).address || {}
  return addr.city || addr.town || addr.village || addr.municipality || addr.county || ''
}

/** só o que já está guardado (memória ou geocode_cache); undefined = ainda não sabemos */
async function lerGuardada(supabase: SupabaseClient, key: string): Promise<string | undefined> {
  if (memCidade[key] !== undefined) return memCidade[key]
  try {
    const { data } = await supabase.from('geocode_cache').select('endereco').eq('coordenada', key).maybeSingle()
    if (data?.endereco) { memCidade[key] = data.endereco; return data.endereco }
  } catch { /* tabela pode não existir */ }
  return undefined
}

async function buscarFora(supabase: SupabaseClient, lat: number, lng: number, key: string): Promise<string> {
  let cidade = ''
  try { cidade = await cidadePhoton(lat, lng) } catch { /* */ }
  if (!cidade) { try { cidade = await cidadeNominatim(lat, lng) } catch { /* */ } }
  // gentileza com os serviços públicos: 1 chamada externa por segundo
  await new Promise((r) => setTimeout(r, 1_100))
  memCidade[key] = cidade
  if (cidade) { try { await supabase.from('geocode_cache').upsert({ coordenada: key, endereco: cidade, lat, lng }) } catch { /* */ } }
  return cidade
}

/** A cidade do ponto (espera a busca externa quando ainda não está guardada). */
export async function cidadeDe(supabase: SupabaseClient, lat: number, lng: number): Promise<string | null> {
  const key = chave(lat, lng)
  const g = await lerGuardada(supabase, key)
  if (g !== undefined) return g || null
  return (await buscarFora(supabase, lat, lng, key)) || null
}

/** Só a guardada, sem esperar: se ainda não sabe, busca POR TRÁS (fila de 1 por segundo) e devolve null agora.
 *  Para telas ao vivo que não podem esperar o serviço externo. */
let fila: Promise<unknown> = Promise.resolve()
export async function cidadeGuardada(supabase: SupabaseClient, lat: number, lng: number): Promise<string | null> {
  const key = chave(lat, lng)
  const g = await lerGuardada(supabase, key)
  if (g !== undefined) return g || null
  if (!buscando.has(key)) {
    buscando.add(key)
    fila = fila.then(() => buscarFora(supabase, lat, lng, key)).catch(() => {}).finally(() => buscando.delete(key))
  }
  return null
}
