// Furo de km de um mecânico no mês (José, 28/10/2026: "pegar os km rodados que não foram cobrados e, quando clicar,
// mostrar no mapa todos os pontos e as rotas não cobradas, e pedir pro Tratorilson resumir onde foi o furo") — SÓ SERVIDOR.
// Dia a dia: km do GPS (frota_dias) × km cobrado nas OS daquele dia (Qtd_KM repartido pelos dias da OS) × km do relatório,
// com as paradas classificadas do carro (frota_paradas). O Tratorilson lê os dias com furo e resume onde ele está.
// 28/10/2026 (2º pedido: "mostrar o caminho, a cidade, horário e tudo que for possível; dá pra saber quando ele saiu para o
// cliente e quanto tempo o carro ficou no cliente?"): cada parada é cruzada com a localização do cliente da OS do dia —
// a confirmada no faturar (clientes_localizacoes) ou a do cadastro — a até 500 m = "no cliente"; sem localização, a
// parada mais longa fora da loja num dia de OS vira "provável cliente". O dia aberto ganha a cidade de cada parada
// (ORS reverse) e os km de cada trecho (pontos do GPS entre uma parada e a próxima).
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { chamarIA } from '@/lib/assistente/ia'
import { computarESalvarRota } from '@/lib/pos/rastreamento'
import { distanciaM, minutosNoExpediente, soDigitos, LOJA, RAIO_LOJA_M } from '@/lib/pos/localizacao-cliente'
import { fantasmasDoMes } from './fantasmas-server'
import { comCache } from './cache'
import { motivosZeca, type MotivoZeca, type OSZeca } from './robo-zeca'
import { DIVERGENCIAS, type Divergencia } from './divergencias'
export { ehDivergencia, type Divergencia } from './divergencias'

type Rec = Record<string, unknown>
const r1 = (n: number) => Math.round(n * 10) / 10
const placaLimpa = (p: unknown) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const RAIO_CLIENTE_M = 500
const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/s+/).filter((w) => w.length > 2)
/** mesmo técnico: mesmo primeiro nome e, se os dois tiverem sobrenome, um sobrenome em comum */
function mesmoNome(a: string, b: string): boolean {
  const x = chave(a), y = chave(b)
  if (!x.length || !y.length || x[0] !== y[0]) return false
  return x.length === 1 || y.length === 1 || x.slice(1).some((w) => y.includes(w))
}

export const CLASSE_PARADA: Record<string, string> = {
  loja: 'Loja', cliente: 'Cliente', cliente_portal: 'Propriedade de cliente', manutencao: 'Manutenção',
  estacionamento: 'Estacionamento', descarga: 'Descarga', outro_destino: 'Destino cadastrado',
  visita: 'Visita comercial', abastecimento: 'Abastecimento', fora_geocerca: 'Fora de geocerca',
}

/** confirmado = bateu com a localização do faturar · cadastro = com a do cadastro do cliente · provavel = parada mais longa do dia */
export type ConfCliente = 'confirmado' | 'cadastro' | 'provavel'
export interface ParadaFuro {
  inicio: string; fim: string | null; min: number; lat: number; lng: number; onde: string; classe: string; atipica: boolean
  loja: boolean; cliente: { os: string; nome: string; conf: ConfCliente; colega?: string } | null; cidade?: string | null; kmAntes?: number
}
export interface OSDoDia { os: string; cliente: string; kmCobrado: number; horasRel: number; noCliente: { inicio: string; fim: string | null; min: number; conf: ConfCliente } | null }
export interface DiaFuro {
  data: string; placa: string | null; kmGps: number; kmCobrado: number; kmRel: number; furo: number; ligadoH: number
  saida: string | null; volta: string | null; os: OSDoDia[]; paradas: ParadaFuro[]
  /** OS de OUTROS técnicos no mesmo dia (José, 28/10/2026: "ele não acompanhou nenhum técnico também?") */
  /** naOS = ele consta como técnico na OS do colega (Os_Tecnico/Os_Tecnico2) — José: "se foi com outro técnico, confirma na ordem; se não tiver o nome dele, avisa" */
  colegas: (OSDoDia & { tecnico: string; semCarro: boolean; naOS: boolean })[]
}
export interface OSTotal {
  os: string; cliente: string; cidade: string; dias: string[]; kmRel: number; kmCobrado: number; horasRel: number; horasCobradas: number
  /** Zeca da Frota: por que o relatório não virou cobrança (só quando diverge) e o que o GPS mostra */
  zecaKm?: MotivoZeca[]; zecaHoras?: MotivoZeca[]; gps?: string
}
export interface FuroKm { tecnico: string; mes: string; placas: string[]; dias: DiaFuro[]; kmGps: number; kmCobrado: number; furo: number; osTotais: OSTotal[] }

type Loc = { lat: number; lng: number; nome: string; conf: 'confirmado' | 'cadastro' }

/** onde fica cada cliente (por CPF/CNPJ): as confirmadas no faturar e, sem elas, a do cadastro */
async function locaisDosClientes(docs: string[]): Promise<Map<string, Loc[]>> {
  const out = new Map<string, Loc[]>()
  if (!docs.length) return out
  const { data: conf } = await sb.from('clientes_localizacoes').select('documento, nome, lat, lng').in('documento', docs)
  for (const l of (conf || []) as Rec[]) {
    const k = soDigitos(l.documento)
    out.set(k, [...(out.get(k) || []), { lat: Number(l.lat), lng: Number(l.lng), nome: String(l.nome || ''), conf: 'confirmado' }])
  }
  const faltam = new Set(docs.filter((d) => !out.has(d)))
  if (faltam.size) {
    const { data: cad } = await sb.from('portal_nt_clientes_PRINCIPAL').select('cnpj_cpf, latitude, longitude, lat, lng').or('latitude.not.is.null,lat.not.is.null').limit(2000)
    for (const c of (cad || []) as Rec[]) {
      const k = soDigitos(c.cnpj_cpf)
      if (!faltam.has(k)) continue
      const lat = Number(c.latitude ?? c.lat), lng = Number(c.longitude ?? c.lng)
      if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) out.set(k, [{ lat, lng, nome: 'cadastro', conf: 'cadastro' }])
    }
  }
  return out
}

export async function furoKm(tecnico: string, mes: string): Promise<FuroKm | null> {
  const f = await fantasmasDoMes(mes)
  const t = f.tecnicos.find((x) => x.tecnico === tecnico)
  if (!t) return null
  // km cobrado de cada dia: o Qtd_KM de cada OS repartido pelos dias dela
  const cobradoDia = new Map<string, number>()
  for (const o of t.os) for (const d of o.dias) cobradoDia.set(d, (cobradoDia.get(d) || 0) + o.kmCobrado / Math.max(1, o.dias.length))
  const osPorId = new Map(t.os.map((o) => [o.os, o]))
  // documento do cliente de cada OS → onde ele fica
  const docDe = new Map<string, string>()
  const tecsDe = new Map<string, string[]>()
  const infoOS = new Map<string, Rec>()
  const outros = f.tecnicos.filter((y) => y.tecnico !== tecnico)
  const ids = [...new Set([...t.os.map((o) => o.os), ...outros.flatMap((y) => y.os.map((o) => o.os))])]
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('Ordem_Servico').select('Id_Ordem, Cnpj_Cliente, Os_Tecnico, Os_Tecnico2, Cidade_Cliente, Status, faturamento_status, Servico_Interno, Servico_Oficina, Tipo_Servico, Desconto_KM, Desconto_Hora, Qtd_KM, Qtd_HR, recibo_numero, faturado_por, faturado_omie_em').in('Id_Ordem', ids.slice(i, i + 200))
    for (const o of (data || []) as Rec[]) { docDe.set(String(o.Id_Ordem), soDigitos(o.Cnpj_Cliente)); tecsDe.set(String(o.Id_Ordem), [o.Os_Tecnico, o.Os_Tecnico2].map((x) => String(x || ''))); infoOS.set(String(o.Id_Ordem), o) }
  }
  const locais = await locaisDosClientes([...new Set([...docDe.values()].filter(Boolean))]).catch(() => new Map<string, Loc[]>())

  const dias: DiaFuro[] = t.dias.filter((d) => d.kmCarro > 0 || d.os.length).map((d) => {
    const kmCobrado = r1(cobradoDia.get(d.data) || 0)
    return {
      data: d.data, placa: t.placas[0] || null, kmGps: r1(d.kmCarro), ligadoH: r1(d.ligadoH), kmCobrado, kmRel: r1(d.kmRel), furo: r1(Math.max(0, d.kmCarro - kmCobrado)),
      saida: d.inicio, volta: d.fim, paradas: [],
      colegas: outros.flatMap((y) => (y.dias.find((z) => z.data === d.data)?.os || []).filter((os) => !d.os.includes(os)).map((os) => {
        const o = y.os.find((z) => z.os === os)
        return { tecnico: y.tecnico, semCarro: !y.placas.length, naOS: (tecsDe.get(os) || []).some((n) => mesmoNome(n, tecnico)), os, cliente: o?.cliente || '', kmCobrado: r1((o?.kmCobrado || 0) / Math.max(1, o?.dias.length || 1)), horasRel: r1((o?.horasRel || 0) / Math.max(1, o?.dias.length || 1)), noCliente: null }
      })),
      os: d.os.map((os) => { const o = osPorId.get(os); return { os, cliente: o?.cliente || '', kmCobrado: r1((o?.kmCobrado || 0) / Math.max(1, o?.dias.length || 1)), horasRel: r1((o?.horasRel || 0) / Math.max(1, o?.dias.length || 1)), noCliente: null } }),
    }
  })
  // paradas do carro em todos os dias com GPS
  const comGps = dias.filter((d) => d.kmGps > 0).map((d) => d.data)
  if (t.placas.length && comGps.length) {
    const variantes = [...new Set(t.placas.flatMap((p) => [p, p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p]))]
    const { data } = await sb.from('frota_paradas').select('placa, data, inicio, fim, duracao_min, latitude, longitude, classe, destino_nome, atipica')
      .in('placa', variantes).in('data', comGps).order('inicio').limit(5000)
    for (const p of (data || []) as Rec[]) {
      const d = dias.find((x) => x.data === String(p.data))
      if (!d) continue
      d.placa = placaLimpa(p.placa)
      const lat = Number(p.latitude), lng = Number(p.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const classe = String(p.classe || '')
      d.paradas.push({ inicio: String(p.inicio), fim: (p.fim as string) || null, min: Math.round(Number(p.duracao_min) || 0), lat, lng,
        onde: String(p.destino_nome || CLASSE_PARADA[classe] || 'Local sem cadastro'), classe, atipica: !!p.atipica,
        loja: classe === 'loja' || distanciaM({ lat, lng }, LOJA) <= RAIO_LOJA_M, cliente: null })
    }
  }
  // cruza parada × cliente da OS do dia
  for (const d of dias) {
    for (const o of d.os) {
      const locs = locais.get(docDe.get(o.os) || '') || []
      for (const p of d.paradas) {
        if (p.loja || p.cliente) continue
        const l = locs.find((x) => distanciaM(p, x) <= RAIO_CLIENTE_M)
        if (l) p.cliente = { os: o.os, nome: o.cliente, conf: l.conf }
      }
    }
    // OS do dia sem parada no cliente: a parada mais longa (≥ 30 min no expediente, fora da loja) é o provável cliente
    const semLugar = d.os.filter((o) => !d.paradas.some((p) => p.cliente?.os === o.os))
    if (semLugar.length === 1) {
      const cand = d.paradas.filter((p) => !p.loja && !p.cliente && minutosNoExpediente(p.inicio, p.fim, p.min) >= 30).sort((a, b) => b.min - a.min)[0]
      if (cand) cand.cliente = { os: semLugar[0].os, nome: semLugar[0].cliente, conf: 'provavel' }
    }
    // OS dos colegas no mesmo dia: o carro dele passou no cliente do colega? (levou alguém, ou foi junto)
    for (const o of d.colegas) {
      const locs = locais.get(docDe.get(o.os) || '') || []
      for (const p of d.paradas) {
        if (p.loja || p.cliente) continue
        const l = locs.find((x) => distanciaM(p, x) <= RAIO_CLIENTE_M)
        if (l) p.cliente = { os: o.os, nome: o.cliente, conf: l.conf, colega: o.tecnico }
      }
    }
    // dia sem OS dele e um só colega em OS (ex.: Fernando, que não tem carro): a parada mais longa vira o provável cliente do colega
    if (!d.os.length) {
      const sem = d.colegas.filter((o) => !d.paradas.some((p) => p.cliente?.os === o.os))
      const unico = sem.length === 1 ? sem[0] : sem.filter((o) => o.semCarro).length === 1 ? sem.find((o) => o.semCarro)! : null
      if (unico) {
        const cand = d.paradas.filter((p) => !p.loja && !p.cliente && minutosNoExpediente(p.inicio, p.fim, p.min) >= 30).sort((a, b) => b.min - a.min)[0]
        if (cand) cand.cliente = { os: unico.os, nome: unico.cliente, conf: 'provavel', colega: unico.tecnico }
      }
    }
    for (const o of [...d.os, ...d.colegas]) {
      const ps = d.paradas.filter((p) => p.cliente?.os === o.os)
      if (!ps.length) continue
      const conf = ps.some((p) => p.cliente!.conf === 'confirmado') ? 'confirmado' : ps.some((p) => p.cliente!.conf === 'cadastro') ? 'cadastro' : 'provavel'
      o.noCliente = { inicio: ps[0].inicio, fim: ps[ps.length - 1].fim, min: ps.reduce((s, p) => s + p.min, 0), conf }
    }
  }
  dias.sort((a, b) => b.furo - a.furo || b.data.localeCompare(a.data))
  const osTotais: OSTotal[] = []
  for (const o of t.os) {
    const inf = (infoOS.get(o.os) || {}) as Rec
    const cidade = String(inf.Cidade_Cliente || '')
    const difKm = o.kmRel - o.kmCobrado > 0.5, difH = o.horasRel - o.horasCobradas > 0.05
    const tot: OSTotal = { os: o.os, cliente: o.cliente, cidade, dias: o.dias, kmRel: o.kmRel, kmCobrado: o.kmCobrado, horasRel: o.horasRel, horasCobradas: o.horasCobradas }
    if (difKm) tot.zecaKm = motivosZeca(inf as OSZeca, 'km', o.kmRel, o.kmCobrado)
    if (difH) tot.zecaHoras = motivosZeca(inf as OSZeca, 'horas', o.horasRel, o.horasCobradas)
    if (difKm || difH) tot.gps = await provaGps(o.os, o.dias, cidade, dias, t.tecnico.split(' ')[0]).catch(() => undefined)
    osTotais.push(tot)
  }
  return { tecnico, mes, placas: t.placas, dias, osTotais, kmGps: Math.round(t.totais.kmCarro), kmCobrado: Math.round(t.totais.kmCobrado), furo: Math.max(0, Math.round(t.totais.kmCarro - t.totais.kmCobrado)) }
}

// ── Cidades (José, 28/10/2026). A ORS tem cota diária e estourou nos testes: agora cada ponto/cidade é procurado UMA
// vez e fica guardado no banco (posvendas_painel_cache, chaves geo-cidade:/geo-centro:); sem cota na ORS, usa o
// Nominatim (OpenStreetMap, 1 pedido por segundo).
const GEO_TABELA = 'posvendas_painel_cache'
const GEO = new Map<string, unknown>()
let orsParadaAte = 0
let filaOsm: Promise<unknown> = Promise.resolve()
/** Nominatim: um pedido por vez, 1,1 s entre eles (regra do OpenStreetMap) */
function osm<T>(url: string): Promise<T | null> {
  const p = filaOsm.then(async () => {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'PortalNovaTratores/1.0', 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(8000) })
      return r.ok ? ((await r.json()) as T) : null
    } catch { return null } finally { await new Promise((ok) => setTimeout(ok, 1100)) }
  })
  filaOsm = p.catch(() => null)
  return p
}
async function ors<T>(caminho: string): Promise<T | null> {
  const key = process.env.ORS_API_KEY || process.env.NEXT_PUBLIC_ORS_API_KEY || ''
  if (!key || Date.now() < orsParadaAte) return null
  try {
    const r = await fetch(`https://api.openrouteservice.org${caminho}&api_key=${key}`, { signal: AbortSignal.timeout(6000) })
    if (r.status === 403 || r.status === 429) { orsParadaAte = Date.now() + 3600_000; return null } // sem cota: 1 h só no OpenStreetMap
    return r.ok ? ((await r.json()) as T) : null
  } catch { return null }
}
/** lê do banco as chaves que ainda não estão na memória */
async function geoGuardados(chaves: string[]) {
  const faltam = chaves.filter((k) => !GEO.has(k))
  for (let i = 0; i < faltam.length; i += 200) {
    const { data } = await sb.from(GEO_TABELA).select('chave, dados').in('chave', faltam.slice(i, i + 200))
    for (const r of (data || []) as Rec[]) GEO.set(String(r.chave), (r.dados as { v: unknown }).v)
  }
}
async function geoGuardar(chave: string, v: unknown) {
  GEO.set(chave, v)
  await sb.from(GEO_TABELA).upsert({ chave, dados: { v }, gerado_em: new Date().toISOString() }).then(() => {}, () => {})
}
const UF: Record<string, string> = { 'São Paulo': 'SP', 'Paraná': 'PR', 'Minas Gerais': 'MG', 'Mato Grosso do Sul': 'MS', 'Santa Catarina': 'SC', 'Goiás': 'GO', 'Rio de Janeiro': 'RJ' }

// centro de cada cidade de cliente (para saber se o carro foi à cidade da OS)
async function centroDa(cidade: string): Promise<{ lat: number; lng: number } | null> {
  const k = cidade.toUpperCase().trim()
  if (!k) return null
  const chave = `geo-centro:${k}`
  await geoGuardados([chave])
  if (GEO.has(chave)) return GEO.get(chave) as { lat: number; lng: number } | null
  const nome = k.replace(/\s*\((\w{2})\)\s*$/, ''), uf = /\((\w{2})\)\s*$/.exec(k)?.[1] || ''
  const o = await ors<{ features?: { geometry?: { coordinates?: number[] } }[] }>(`/geocode/search?text=${encodeURIComponent(`${nome}, ${uf}`)}&boundary.country=BR&size=1&layers=locality,localadmin`)
  let c = o?.features?.[0]?.geometry?.coordinates ? { lat: o.features[0].geometry!.coordinates![1], lng: o.features[0].geometry!.coordinates![0] } : null
  if (!c) {
    const n = await osm<{ lat: string; lon: string }[]>(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&city=${encodeURIComponent(nome)}${uf ? `&state=${encodeURIComponent(Object.keys(UF).find((x) => UF[x] === uf) || uf)}` : ''}`)
    c = n?.[0] ? { lat: Number(n[0].lat), lng: Number(n[0].lon) } : null
  }
  if (c) await geoGuardar(chave, c)
  return c
}
/** O que o GPS diz dessa OS: o carro esteve no cliente? foi à cidade do cliente nos dias da OS? */
async function provaGps(os: string, diasOS: string[], cidade: string, dias: DiaFuro[], nome: string): Promise<string | undefined> {
  const ds = dias.filter((d) => diasOS.includes(d.data) && d.kmGps > 0)
  if (!ds.length) return `Sem GPS do carro de ${nome} nos dias da OS.`
  for (const d of ds) {
    const o = d.os.find((x) => x.os === os)
    if (o?.noCliente) return `O carro de ${nome} esteve no cliente em ${d.data.slice(8, 10)}/${d.data.slice(5, 7)} (${o.noCliente.min} min).`
  }
  const c = await centroDa(cidade)
  if (!c) return undefined
  const nomeCid = cidade.replace(/\s*\(\w{2}\)\s*$/, '').toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())
  for (const d of ds) if (d.paradas.some((p) => !p.loja && distanciaM(p, c) <= 20000)) return `O carro de ${nome} esteve em ${nomeCid} em ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}.`
  return `O carro de ${nome} não passou por ${nomeCid} nos dias da OS.`
}

// cidade de um ponto (parada), guardada por ponto arredondado (~100 m)
async function cidadeDe(lat: number, lng: number): Promise<string | null> {
  const chave = `geo-cidade:${lat.toFixed(3)},${lng.toFixed(3)}`
  if (GEO.has(chave)) return GEO.get(chave) as string | null
  const o = await ors<{ features?: { properties?: Record<string, string> }[] }>(`/geocode/reverse?point.lat=${lat}&point.lon=${lng}&size=1&layers=locality,localadmin,county`)
  const pr = o?.features?.[0]?.properties
  let cid = pr && (pr.locality || pr.localadmin || pr.county) ? `${pr.locality || pr.localadmin || pr.county}${pr.region_a ? ` - ${pr.region_a}` : ''}` : null
  if (!cid) {
    const n = await osm<{ address?: Record<string, string> }>(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lng}`)
    const ad = n?.address
    const nome = ad && (ad.city || ad.town || ad.village || ad.municipality)
    cid = nome ? `${nome}${ad?.state && UF[ad.state] ? ` - ${UF[ad.state]}` : ''}` : null
  }
  if (cid) await geoGuardar(chave, cid)
  return cid
}

/** cidade de várias paradas: primeiro o que já está guardado, depois de 4 em 4 */
async function cidadesDe(ps: ParadaFuro[]) {
  await geoGuardados([...new Set(ps.map((p) => `geo-cidade:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`))])
  for (let i = 0; i < ps.length; i += 4) await Promise.all(ps.slice(i, i + 4).map(async (p) => { p.cidade = await cidadeDe(p.lat, p.lng) }))
}

/** km percorridos entre dois horários, somando os pontos do GPS */
function kmEntre(pts: { lat: number; lng: number; dt: string }[], de: number, ate: number): number {
  let m = 0, ant: { lat: number; lng: number } | null = null
  for (const p of pts) {
    const t = Date.parse(p.dt)
    if (t < de) { ant = p; continue }
    if (t > ate) break
    if (ant) { const d = distanciaM(ant, p); if (d < 20000) m += d }
    ant = p
  }
  return r1(m / 1000)
}

export interface DiaDetalhado extends DiaFuro { pontos: { lat: number; lng: number; dt: string }[]; kmFinal: number }

/** Um dia aberto no mapa: rota, paradas com cidade e os km de cada trecho. */
export async function diaDetalhado(tecnico: string, mes: string, dia: string): Promise<DiaDetalhado | null> {
  const fk = await furoKm(tecnico, mes)
  const d = fk?.dias.find((x) => x.data === dia)
  if (!d) return null
  let pontos: { lat: number; lng: number; dt: string }[] = []
  if (d.placa) {
    try { const r = await computarESalvarRota(sb, d.placa, dia); pontos = (r.pontos || []).map((p) => ({ lat: p.lat, lng: p.lng, dt: p.dt })) } catch { pontos = [] }
  }
  pontos.sort((a, b) => a.dt.localeCompare(b.dt))
  const ps = [...d.paradas].sort((a, b) => a.inicio.localeCompare(b.inicio))
  let ant = pontos.length ? Date.parse(pontos[0].dt) : 0
  for (const p of ps) {
    p.kmAntes = pontos.length ? kmEntre(pontos, ant, Date.parse(p.inicio)) : undefined
    ant = Date.parse(p.fim || p.inicio)
  }
  const kmFinal = pontos.length ? kmEntre(pontos, ant, Date.parse(pontos[pontos.length - 1].dt)) : 0
  // cidade das paradas de 5 min ou mais (até 25 por dia)
  const alvo = ps.filter((p) => !p.loja && p.min >= 15).slice(0, 20)
  await cidadesDe(alvo)
  return { ...d, paradas: ps, pontos, kmFinal }
}

export interface AnaliseFuro { resumo: string; pontos: { titulo: string; valor: number; dias: string[]; os: string[]; explicacao: string }[]; geradoEm: string }

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const br = (d: string) => d.split('-').reverse().join('/')

/** o dia contado para o Tratorilson: GPS, OS, colegas e paradas */
function diaEmTexto(d: DiaFuro): string {
  return [
    `DIA ${br(d.data)}: GPS ${d.kmGps} km · carro ligado ${d.ligadoH} h · relatório ${d.kmRel} km · cobrado nas OS ${d.kmCobrado} km${d.saida ? ` · carro ligou ${hora(d.saida)}` : ''}${d.volta ? `, desligou ${hora(d.volta)}` : ''}`,
    `  OS dele: ${d.os.length ? d.os.map((o) => `${o.os} (${o.cliente || 'cliente?'}, cobrou ${o.kmCobrado} km${o.noCliente ? `, carro no cliente ${hora(o.noCliente.inicio)}–${o.noCliente.fim ? hora(o.noCliente.fim) : '?'} ${o.noCliente.min} min${o.noCliente.conf === 'provavel' ? ' (provável)' : ''}` : ', carro não passou no cliente'})`).join('; ') : 'NENHUMA'}`,
    `  OS de colegas no mesmo dia: ${d.colegas.length ? d.colegas.map((o) => `${o.tecnico}${o.semCarro ? ' (sem carro)' : ''} ${o.os} (${o.cliente}${o.noCliente ? `, o carro dele passou no cliente ${o.noCliente.min} min${o.noCliente.conf === 'provavel' ? ' provável' : ''}` : ''}; ${o.naOS ? 'ele CONSTA como técnico nessa OS' : 'ele NÃO consta como técnico nessa OS'})`).join('; ') : 'nenhuma'}`,
    `  paradas: ${d.paradas.length ? d.paradas.filter((p) => p.min >= 5).slice(0, 14).map((p) => `${hora(p.inicio)} ${p.cliente ? `cliente ${p.cliente.nome}${p.cliente.colega ? ` (OS do ${p.cliente.colega})` : ''}` : (p.loja ? 'loja' : `${p.cidade || 'lugar sem nome'} (${Math.round(distanciaM(p, LOJA) / 1000)} km da loja${p.classe === 'outro_destino' || p.classe === 'manutencao' || p.classe === 'abastecimento' ? `, ${p.onde}` : ''})`)} ${p.min}min${p.atipica ? ' ATÍPICA' : ''}`).join(' | ') : 'sem paradas registradas'}`,
  ].join('\n')
}

/** os dados e a pergunta de cada divergência */
function pauta(fk: FuroKm, div: Divergencia): { dados?: string; dias?: DiaFuro[]; pergunta: string } | null {
  const dias = (fn: (d: DiaFuro) => boolean) => fk.dias.filter(fn).slice(0, 25)
  if (div === 'km-nao-cobrado' || div === 'horas-nao-cobradas') {
    const km = div === 'km-nao-cobrado'
    const os = fk.osTotais.filter((o) => (km ? o.kmRel - o.kmCobrado : o.horasRel - o.horasCobradas) > (km ? 0.5 : 0.05))
    if (!os.length) return null
    return {
      dados: os.map((o) => `${o.os} (${o.cliente}, ${o.cidade}) dias ${o.dias.map(br).join(', ')}: relatório ${km ? `${o.kmRel} km` : `${o.horasRel} h`} · cobrado ${km ? `${o.kmCobrado} km` : `${o.horasCobradas} h`}\n  FATOS DO ZECA (robô, certos): ${((km ? o.zecaKm : o.zecaHoras) || []).map((m) => m.texto).join(' ')}${o.gps ? ` GPS: ${o.gps}` : ''}`).join('\n'),
      pergunta: km
        ? 'Divergência: km que o mecânico pôs no relatório da OS e não foi cobrado na OS. Explique em quais OS isso aconteceu e o tamanho de cada uma. Os FATOS DO ZECA são certos (vêm dos campos da OS): use-os como a causa e não invente outra; diga só o que conferir a partir deles (ex.: se a OS devia mesmo ser interna). Nos pontos, preencha "os" com as OS.'
        : 'Divergência: horas que o mecânico apontou no relatório da OS e não foram cobradas na OS. Explique em quais OS isso aconteceu e o tamanho de cada uma. Os FATOS DO ZECA são certos (vêm dos campos da OS): use-os como a causa e não invente outra; diga só o que conferir a partir deles. Nos pontos, preencha "os" com as OS.',
    }
  }
  const sel = div === 'km-fora-relatorio' ? dias((d) => d.kmGps - d.kmRel > 5)
    : div === 'dias-sem-os' ? dias((d) => !d.os.length && d.kmGps > 5)
    : div === 'sem-cliente' ? dias((d) => d.os.some((o) => !o.noCliente))
    : div === 'ligado-sem-os' ? dias((d) => !d.os.length && d.ligadoH > 0.05)
    : div === 'colega-fora-os' ? dias((d) => d.colegas.some((o) => o.noCliente && !o.naOS))
    : dias((d) => d.furo > 5)
  if (!sel.length) return null
  const pergunta = {
    'km-fora-relatorio': 'Divergência: km que o carro rodou pelo GPS e não está em nenhum relatório de OS. Explique em quais dias, para onde o carro foi (cidades, paradas, loja, colegas) e o que conferir.',
    'dias-sem-os': 'Divergência: dias em que o carro rodou e o mecânico não tinha nenhuma OS. Para cada dia diga para onde o carro foi e se ele estava levando um colega (o km deveria estar na OS do colega), indo à loja/fornecedor, ou num lugar sem explicação.',
    'ligado-sem-os': 'Divergência: dias em que o carro do mecânico ficou ligado e ele não tinha nenhuma OS. Para cada dia diga quanto tempo o carro ficou ligado, a que horas ligou e desligou, por onde andou (cidades e paradas) e se estava levando um colega, indo à loja/fornecedor ou num lugar sem explicação. Diga o que conferir.',
    'colega-fora-os': 'Divergência: o carro do mecânico esteve no cliente da OS de um colega, mas o nome dele NÃO está nessa OS como técnico. Para cada caso diga o dia, a OS, o colega, o cliente e quanto tempo o carro ficou lá, e recomende conferir com os dois e incluir o mecânico como técnico na OS (o km e as horas dele também devem ir para essa OS). Nos pontos, preencha "os" com as OS.',
    'sem-cliente': 'Divergência: dias de OS em que o carro do mecânico não parou perto do cliente da OS. Explique cada caso: se ele pode ter ido no carro de outro técnico, se o cliente está sem local cadastrado, se o serviço foi na loja, ou se o carro ficou em outro lugar.',
    'geral': '"Furo" = km rodado e não cobrado. Descubra ONDE está o furo e agrupe em poucas causas concretas, por exemplo: dias sem nenhuma OS; OS cobrando menos km do que o deslocamento até o cliente; carro que não passou no cliente da OS; dia em que ele levou ou acompanhou um colega (o km deveria estar na OS do colega); paradas fora de cliente (casa, posto, lugares sem cadastro); idas à loja/fornecedor que não são de nenhuma OS.',
  }[div]
  return { dias: sel, pergunta }
}

/** O Tratorilson explica uma divergência (guardado 6 h por técnico/mês/divergência; forcar refaz). */
export async function analisarFuro(tecnico: string, mes: string, forcar = false, div: Divergencia = 'geral'): Promise<AnaliseFuro | null> {
  const r = await comCache(`furo-km:v8:${mes}:${tecnico}:${div}`, 6 * 3600_000, async () => {
    const fk = await furoKm(tecnico, mes)
    if (!fk) return null
    const p = pauta(fk, div)
    if (!p) return { resumo: 'Não encontrei essa divergência neste mês.', pontos: [], geradoEm: new Date().toISOString() }
    if (p.dias) {
      // cidade das paradas de 15 min ou mais fora da loja (até 40), para ele dizer onde o carro estava
      const alvo = p.dias.flatMap((d) => d.paradas.filter((x) => !x.loja && x.min >= 15)).slice(0, 25)
      await cidadesDe(alvo)
      p.dados = p.dias.map(diaEmTexto).join('\n')
    }
    const unidade = DIVERGENCIAS[div].unidade
    const ia = await chamarIA({
      temperature: 0.2, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `Você é o Tratorilson, auditor da oficina de tratores Nova Tratores. Cruza o GPS do carro do mecânico, os relatórios que ele escreve nas ordens de serviço (OS), o que foi cobrado nas OS, o local do cliente e as OS dos colegas. ${p.pergunta} Cite dias, OS, cidades e quanto tempo o carro ficou parado. Nunca use a palavra "geocerca". Não acuse: diga o que conferir. Português do Brasil, frases curtas, sem jargão. Responda só JSON: {"resumo":"2 ou 3 frases explicando basicamente essa divergência","pontos":[{"titulo":"causa curta (não comece pela data)","valor":número aproximado em ${unidade === 'h' ? 'horas' : unidade === 'dias' ? 'dias' : 'km'},"dias":["AAAA-MM-DD"],"os":["OS-0000"],"explicacao":"1 ou 2 frases com o que conferir"}]} com no máximo 5 pontos, do maior para o menor.` },
        { role: 'user', content: `Mecânico: ${tecnico}\nMês: ${mes}\nTotal do mês: GPS ${fk.kmGps} km · cobrado ${fk.kmCobrado} km\n\n${p.dados}` },
      ],
    })
    let j: { resumo?: string; pontos?: { titulo?: string; valor?: number; km?: number; dias?: string[]; os?: string[]; explicacao?: string }[] } = {}
    try { j = JSON.parse(ia.choices?.[0]?.message?.content || '{}') } catch { j = {} }
    return {
      resumo: String(j.resumo || 'Não consegui resumir.'),
      pontos: (j.pontos || []).slice(0, 5).map((x) => ({
        titulo: String(x.titulo || ''), valor: Math.round((Number(x.valor ?? x.km) || 0) * 10) / 10,
        dias: (x.dias || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)), os: (x.os || []).filter((o) => /^OS-\d+/.test(o)), explicacao: String(x.explicacao || ''),
      })),
      geradoEm: new Date().toISOString(),
    }
  }, forcar)
  return r.dados
}
