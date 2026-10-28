// =============================================================================
// VIAS FORA DO MAPA — regras puras (client-safe, sem banco nem rede).
//
// Pergunta: por onde os carros da frota andam que NÃO é via do mapa
// (OpenStreetMap)? Estrada de fazenda, carreador, atalho de terra.
//
// Como: a malha do OSM é baixada por QUADRANTE de 0,1° (~11 km) uma vez só
// (lib/frota/vias-fora-mapa-server.ts guarda no Storage). Cada ponto do GPS com
// o carro andando mede a distância até a via mais próxima; sequência de pontos
// a mais de LIMIAR_FORA_M vira um TRECHO. O trecho leva junto o último ponto
// na via antes e o primeiro depois — a linha "sai" da estrada e "volta" nela.
//
// "Fora do mapa" = longe de qualquer via cadastrada no OSM (inclui trilhas e
// carreadores já mapeados — esses NÃO contam como fora).
// =============================================================================
import { distKm, filtrarEspetos, type PontoGps } from './gps'
import { rotuloLocal } from './mapa-vivo'

/** Tamanho do quadrante da malha (graus). */
export const TILE_DEG = 0.1
/** Folga ao baixar o quadrante: via que passa logo ao lado da borda conta. */
export const TILE_FOLGA_DEG = 0.004
/** Ponto a mais disto da via mais próxima = fora do mapa. */
export const LIMIAR_FORA_M = 40
/** O trecho só vale se em algum ponto passou disto (GPS deslocado ao lado de rodovia larga não conta). */
export const DIST_MAX_MINIMA_M = 60
/** Trecho mais curto que isto é manobra (pátio, posto, porteira) — descartado. */
export const COMPRIMENTO_MIN_KM = 0.2
/** Pontos seguidos NA via que encerram o trecho (1 ponto só é ruído do GPS). */
export const PONTOS_NA_VIA_PARA_FECHAR = 2
/** Buraco de sinal maior que isto encerra o trecho. */
export const GAP_TRECHO_MIN = 5
/** Velocidade mínima (km/h) para o ponto contar como "andando". */
export const VEL_ANDANDO = 5
/** Grade da frequência de passagens (~55 m). */
export const CELULA_DEG = 0.0005
/** Bucket do índice espacial (~220 m). A busca olha 5×5 buckets (~450 m em volta). */
const BUCKET_DEG = 0.002
/** Distância informada quando não há via nenhuma no raio do índice. */
export const DIST_SEM_VIA_M = 500

// Tipos de `highway` do OSM que NÃO são caminho de carro (nem de trator):
// calçada, escada, plataforma, via projetada/em obra/abandonada.
export const HIGHWAY_IGNORADOS = [
  'proposed', 'construction', 'abandoned', 'razed', 'disused', 'platform', 'bus_stop',
  'elevator', 'corridor', 'steps', 'footway', 'pedestrian', 'bridleway', 'via_ferrata',
]

// ─── Quadrantes ────────────────────────────────────────────────────────────────

/** Chave do quadrante: "-233_-494" = lat -23,3..-23,2 · lng -49,4..-49,3. */
export function chaveTile(lat: number, lng: number): string {
  return `${Math.floor(lat / TILE_DEG)}_${Math.floor(lng / TILE_DEG)}`
}

/** Caixa (s, w, n, e) do quadrante, já com a folga. */
export function caixaTile(chave: string): [number, number, number, number] {
  const [a, b] = chave.split('_').map(Number)
  const s = a * TILE_DEG, w = b * TILE_DEG
  const r = (x: number) => Math.round(x * 1e6) / 1e6
  return [r(s - TILE_FOLGA_DEG), r(w - TILE_FOLGA_DEG), r(s + TILE_DEG + TILE_FOLGA_DEG), r(w + TILE_DEG + TILE_FOLGA_DEG)]
}

/** Consulta Overpass do quadrante (só a geometria, sem etiquetas). */
export function consultaOverpass(chave: string): string {
  const [s, w, n, e] = caixaTile(chave)
  const fora = HIGHWAY_IGNORADOS.join('|')
  return `[out:json][timeout:120];way[highway][highway!~"^(${fora})$"][area!=yes](${s},${w},${n},${e});out skel geom qt;`
}

/** Malha de um quadrante como guardada no Storage: cada via é [lat,lng,lat,lng,…]. */
export interface MalhaTile {
  v: 1
  tile: string
  baixado_em: string
  vias: number[][]
}

/** Converte a resposta do Overpass. Resposta cortada (remark de timeout/memória) = erro. */
export function malhaDoOverpass(chave: string, json: unknown, agoraIso: string): MalhaTile {
  const j = json as { elements?: unknown[]; remark?: string }
  if (!j || !Array.isArray(j.elements)) throw new Error('Overpass: resposta sem "elements"')
  if (j.remark && /error|timed out|out of memory|runtime/i.test(j.remark)) throw new Error(`Overpass: ${j.remark.slice(0, 160)}`)
  const vias: number[][] = []
  for (const el of j.elements as { type?: string; geometry?: { lat: number; lon: number }[] }[]) {
    if (el?.type !== 'way' || !Array.isArray(el.geometry) || el.geometry.length < 2) continue
    const flat: number[] = []
    for (const g of el.geometry) {
      if (!Number.isFinite(g?.lat) || !Number.isFinite(g?.lon)) continue
      flat.push(Math.round(g.lat * 1e6) / 1e6, Math.round(g.lon * 1e6) / 1e6)
    }
    if (flat.length >= 4) vias.push(flat)
  }
  return { v: 1, tile: chave, baixado_em: agoraIso, vias }
}

// ─── Índice espacial e distância ───────────────────────────────────────────────

const M_POR_GRAU_LAT = 110_574

/** Distância (m) do ponto P ao segmento AB, em projeção local (precisa em centenas de metros). */
export function distPontoSegmentoM(plat: number, plng: number, alat: number, alng: number, blat: number, blng: number): number {
  const kx = 111_320 * Math.cos((plat * Math.PI) / 180)
  const ax = (alng - plng) * kx, ay = (alat - plat) * M_POR_GRAU_LAT
  const bx = (blng - plng) * kx, by = (blat - plat) * M_POR_GRAU_LAT
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return Math.sqrt(cx * cx + cy * cy)
}

const chaveBucket = (i: number, j: number) => `${i}:${j}`

export class IndiceVias {
  private segs: number[] = [] // [alat, alng, blat, blng] em sequência
  private buckets = new Map<string, number[]>()
  private tiles = new Set<string>()

  get totalSegmentos() { return this.segs.length / 4 }
  temTile(chave: string) { return this.tiles.has(chave) }

  adicionarMalha(m: MalhaTile) {
    if (this.tiles.has(m.tile)) return
    this.tiles.add(m.tile)
    for (const via of m.vias) {
      for (let k = 0; k + 3 < via.length; k += 2) this.adicionarSegmento(via[k], via[k + 1], via[k + 2], via[k + 3])
    }
  }

  private adicionarSegmento(alat: number, alng: number, blat: number, blng: number) {
    const idx = this.segs.length / 4
    this.segs.push(alat, alng, blat, blng)
    // amostra o segmento a cada meio bucket: cada bucket que ele cruza recebe o índice
    const passos = Math.max(1, Math.ceil(Math.max(Math.abs(blat - alat), Math.abs(blng - alng)) / (BUCKET_DEG / 2)))
    let ultimo = ''
    for (let s = 0; s <= passos; s++) {
      const lat = alat + ((blat - alat) * s) / passos, lng = alng + ((blng - alng) * s) / passos
      const ch = chaveBucket(Math.floor(lat / BUCKET_DEG), Math.floor(lng / BUCKET_DEG))
      if (ch === ultimo) continue
      ultimo = ch
      const l = this.buckets.get(ch)
      if (!l) this.buckets.set(ch, [idx])
      else if (l[l.length - 1] !== idx) l.push(idx)
    }
  }

  /** Distância (m) até a via mais próxima; DIST_SEM_VIA_M quando não há nenhuma em ~450 m. */
  distanciaM(lat: number, lng: number): number {
    const bi = Math.floor(lat / BUCKET_DEG), bj = Math.floor(lng / BUCKET_DEG)
    let melhor = Infinity
    const vistos = new Set<number>()
    for (let di = -2; di <= 2; di++) {
      for (let dj = -2; dj <= 2; dj++) {
        const l = this.buckets.get(chaveBucket(bi + di, bj + dj))
        if (!l) continue
        for (const idx of l) {
          if (vistos.has(idx)) continue
          vistos.add(idx)
          const o = idx * 4
          const d = distPontoSegmentoM(lat, lng, this.segs[o], this.segs[o + 1], this.segs[o + 2], this.segs[o + 3])
          if (d < melhor) melhor = d
        }
      }
    }
    return Math.min(melhor, DIST_SEM_VIA_M)
  }
}

// ─── Classificação de um dia ───────────────────────────────────────────────────

export interface TrechoFora {
  inicio: string
  fim: string
  /** [lat, lng, vel] — inclui o ponto na via antes e o depois (quando existem) */
  pontos: [number, number, number][]
  km: number
  vel_mediana: number
  dist_max_m: number
  dist_mediana_m: number
  lat_min: number; lat_max: number; lng_min: number; lng_max: number
}

export interface ResultadoDia {
  trechos: TrechoFora[]
  pontosAndando: number
  pontosFora: number
  /** quadrantes que o dia precisa e o índice não tem (dia fica pendente) */
  tilesFaltando: string[]
}

const tsMs = (iso: string) => new Date(iso).getTime()

/** Pontos com o carro andando (velocidade do rastreador), em ordem e sem espetos. */
export function pontosAndando(pontos: PontoGps[]): PontoGps[] {
  const ordenados = [...pontos]
    .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && p.lat !== 0 && p.lng !== 0 && p.dt)
    .sort((a, b) => tsMs(a.dt) - tsMs(b.dt))
  return filtrarEspetos(ordenados.filter((p) => (Number(p.vel) || 0) >= VEL_ANDANDO))
}

/** Quadrantes que os pontos andando do dia tocam. */
export function tilesDoDia(pontos: PontoGps[]): string[] {
  return [...new Set(pontosAndando(pontos).map((p) => chaveTile(p.lat, p.lng)))].sort()
}

function mediana(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Trechos fora do mapa de um dia de um carro. Não decide nada sobre quadrante
 * faltando: se faltar, devolve só `tilesFaltando` (quem chama não grava o dia).
 */
export function classificarDia(pontos: PontoGps[], indice: IndiceVias): ResultadoDia {
  const andando = pontosAndando(pontos)
  const faltando = [...new Set(andando.map((p) => chaveTile(p.lat, p.lng)))].filter((t) => !indice.temTile(t)).sort()
  if (faltando.length) return { trechos: [], pontosAndando: andando.length, pontosFora: 0, tilesFaltando: faltando }

  const dist = andando.map((p) => indice.distanciaM(p.lat, p.lng))
  const fora = dist.map((d) => d > LIMIAR_FORA_M)
  const trechos: TrechoFora[] = []

  let i = 0
  while (i < andando.length) {
    if (!fora[i]) { i++; continue }
    // abre o trecho em i; anda até PONTOS_NA_VIA_PARA_FECHAR pontos seguidos na via ou buraco de sinal
    const ini = i
    let fim = i
    let j = i + 1
    while (j < andando.length) {
      const gapMin = (tsMs(andando[j].dt) - tsMs(andando[j - 1].dt)) / 60_000
      if (gapMin > GAP_TRECHO_MIN) break
      if (fora[j]) { fim = j; j++; continue }
      let k = j
      while (k < andando.length && !fora[k] && k - j < PONTOS_NA_VIA_PARA_FECHAR) k++
      if (k - j >= PONTOS_NA_VIA_PARA_FECHAR || k >= andando.length) break
      // ruído: um ponto só na via no meio do trecho
      j = k
    }
    const idxForas = []
    for (let x = ini; x <= fim; x++) if (fora[x]) idxForas.push(x)
    // ponto na via antes/depois (conecta a linha à estrada), se não houve buraco de sinal
    const antes = ini > 0 && (tsMs(andando[ini].dt) - tsMs(andando[ini - 1].dt)) / 60_000 <= GAP_TRECHO_MIN ? ini - 1 : ini
    const depois = fim + 1 < andando.length && (tsMs(andando[fim + 1].dt) - tsMs(andando[fim].dt)) / 60_000 <= GAP_TRECHO_MIN ? fim + 1 : fim
    const pts = andando.slice(antes, depois + 1)
    let km = 0
    for (let x = 1; x < pts.length; x++) km += distKm(pts[x - 1], pts[x])
    // comprimento mínimo medido só na parte fora (sem os conectores com a via)
    let kmFora = 0
    for (let x = ini + 1; x <= fim; x++) kmFora += distKm(andando[x - 1], andando[x])
    const distForas = idxForas.map((x) => dist[x])
    const distMax = Math.max(...distForas)
    if (idxForas.length >= 2 && kmFora >= COMPRIMENTO_MIN_KM && distMax >= DIST_MAX_MINIMA_M) {
      const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng)
      trechos.push({
        inicio: andando[ini].dt,
        fim: andando[fim].dt,
        pontos: pts.map((p) => [p.lat, p.lng, Math.round(Number(p.vel) || 0)]),
        km: Math.round(km * 1000) / 1000,
        vel_mediana: Math.round(mediana(idxForas.map((x) => Number(andando[x].vel) || 0)) * 10) / 10,
        dist_max_m: Math.round(distMax),
        dist_mediana_m: Math.round(mediana(distForas)),
        lat_min: Math.min(...lats), lat_max: Math.max(...lats),
        lng_min: Math.min(...lngs), lng_max: Math.max(...lngs),
      })
    }
    i = Math.max(depois, fim + 1)
  }

  return { trechos, pontosAndando: andando.length, pontosFora: fora.filter(Boolean).length, tilesFaltando: [] }
}

/** Muda quando a rota do dia foi recalculada (o cron regrava o dia com mais pontos). */
export function assinaturaRota(r: { hora_fim?: string | null; km_total?: number | string | null; n_pontos?: number | null }): string {
  return `${r.hora_fim || ''}|${r.km_total ?? ''}|${r.n_pontos ?? ''}`
}

// ─── Leitura na tela: frequência das passagens ─────────────────────────────────

export interface TrechoLido {
  id: number
  placa: string
  data: string
  pontos: [number, number, number][]
}

const chaveCelula = (lat: number, lng: number) => `${Math.round(lat / CELULA_DEG)}:${Math.round(lng / CELULA_DEG)}`

/** Células (~55 m) por onde a linha do trecho passa — interpola entre pontos distantes. */
export function celulasDoTrecho(pontos: [number, number, number][]): Set<string> {
  const out = new Set<string>()
  for (let k = 0; k < pontos.length; k++) {
    const [lat, lng] = pontos[k]
    out.add(chaveCelula(lat, lng))
    if (k + 1 < pontos.length) {
      const [lat2, lng2] = pontos[k + 1]
      const passos = Math.min(200, Math.ceil(Math.max(Math.abs(lat2 - lat), Math.abs(lng2 - lng)) / CELULA_DEG))
      for (let s = 1; s < passos; s++) out.add(chaveCelula(lat + ((lat2 - lat) * s) / passos, lng + ((lng2 - lng) * s) / passos))
    }
  }
  return out
}

export interface Frequencia {
  /** por id do trecho: quantas passagens (carro+dia distintos) a via teve — mediana das células */
  passagens: Map<number, number>
  /** por id do trecho: os outros trechos que dividem células com ele (mesma via) */
  mesmaVia: Map<number, number[]>
}

/**
 * Quantas vezes cada via foi usada. Passagem = (placa, dia) distinto — o mesmo
 * carro indo e voltando no mesmo dia conta uma vez. A mediana das células evita
 * que um cruzamento com estrada movimentada infle um trecho pouco usado.
 */
export function frequenciaTrechos(trechos: TrechoLido[]): Frequencia {
  const celulasPorTrecho = new Map<number, Set<string>>()
  const passagensPorCelula = new Map<string, Set<string>>()
  const trechosPorCelula = new Map<string, number[]>()
  for (const t of trechos) {
    const cels = celulasDoTrecho(t.pontos)
    celulasPorTrecho.set(t.id, cels)
    const passagem = `${t.placa}|${t.data}`
    for (const c of cels) {
      let p = passagensPorCelula.get(c)
      if (!p) passagensPorCelula.set(c, (p = new Set()))
      p.add(passagem)
      let l = trechosPorCelula.get(c)
      if (!l) trechosPorCelula.set(c, (l = []))
      l.push(t.id)
    }
  }
  const passagens = new Map<number, number>()
  const mesmaVia = new Map<number, number[]>()
  for (const t of trechos) {
    const cels = [...(celulasPorTrecho.get(t.id) || [])]
    passagens.set(t.id, Math.max(1, Math.round(mediana(cels.map((c) => passagensPorCelula.get(c)?.size || 1)))))
    // "mesma via" = divide pelo menos 1/3 das próprias células com o outro trecho
    const conta = new Map<number, number>()
    for (const c of cels) for (const o of trechosPorCelula.get(c) || []) if (o !== t.id) conta.set(o, (conta.get(o) || 0) + 1)
    mesmaVia.set(t.id, [...conta].filter(([, n]) => n >= Math.max(2, cels.length / 3)).map(([o]) => o))
  }
  return { passagens, mesmaVia }
}

/** Faixa de cor/espessura pela quantidade de passagens. */
export function estiloPassagens(n: number): { cor: string; peso: number; rotulo: string } {
  if (n >= 5) return { cor: '#b91c1c', peso: 6, rotulo: '5+ passagens' }
  if (n >= 2) return { cor: '#ea580c', peso: 4.5, rotulo: '2 a 4 passagens' }
  return { cor: '#d97706', peso: 3, rotulo: '1 passagem' }
}

// ─── De onde vinha / para onde ia ──────────────────────────────────────────────

/** Parada já classificada pelo fechar-dia (frota_paradas). */
export interface ParadaLida {
  inicio: string
  fim: string | null
  duracao_min: number | null
  classe: string | null
  destino_nome: string | null
  justificativa: string | null
  endereco: string | null
}

export interface PontaTrecho {
  rotulo: string
  /** ISO: chegada (para) ou saída (de) */
  hora: string
  duracao_min: number | null
  /** lugar cadastrado (loja, cliente, geocerca) — false = parada sem cadastro */
  conhecido: boolean
}

/** Até quanto tempo antes/depois do trecho a parada ainda conta como origem/destino. */
export const JANELA_PONTA_MIN = 90

function rotuloParada(p: ParadaLida): { rotulo: string; conhecido: boolean } {
  if (!p.classe || p.classe === 'fora_geocerca') {
    return { rotulo: p.justificativa?.trim() || p.endereco?.trim() || 'Parada sem local cadastrado', conhecido: false }
  }
  return { rotulo: rotuloLocal(p.classe, p.destino_nome), conhecido: true }
}

/** A parada logo depois do trecho (para onde ia) e a logo antes (de onde vinha), do mesmo carro e dia. */
export function pontasDoTrecho(t: { inicio: string; fim: string }, paradas: ParadaLida[]): { de: PontaTrecho | null; para: PontaTrecho | null } {
  const ini = tsMs(t.inicio), fim = tsMs(t.fim)
  const folga = 2 * 60_000, janela = JANELA_PONTA_MIN * 60_000
  const depois = paradas
    .filter((p) => tsMs(p.inicio) >= fim - folga && tsMs(p.inicio) <= fim + janela)
    .sort((a, b) => tsMs(a.inicio) - tsMs(b.inicio))[0]
  const antes = paradas
    .filter((p) => p.fim && tsMs(p.fim) <= ini + folga && tsMs(p.fim) >= ini - janela)
    .sort((a, b) => tsMs(b.fim as string) - tsMs(a.fim as string))[0]
  return {
    para: depois ? { ...rotuloParada(depois), hora: depois.inicio, duracao_min: depois.duracao_min } : null,
    de: antes ? { ...rotuloParada(antes), hora: antes.fim as string, duracao_min: antes.duracao_min } : null,
  }
}

// ─── Exportação (rotas para GPS/Google My Maps) ────────────────────────────────

const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] || c))

/** GPX com um track por trecho — abre no Google My Maps, OsmAnd, Maps.me, Garmin. */
export function gerarGpx(trechos: (TrechoLido & { inicio: string; km: number })[], titulo = 'Vias fora do mapa — Nova Tratores'): string {
  const trks = trechos.map((t) => {
    const nome = `${t.placa} · ${t.data.split('-').reverse().join('/')} · ${t.km.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`
    const pts = t.pontos.map(([lat, lng]) => `<trkpt lat="${lat}" lon="${lng}"/>`).join('')
    return `<trk><name>${xml(nome)}</name><type>fora-do-mapa</type><trkseg>${pts}</trkseg></trk>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Portal Nova Tratores" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${xml(titulo)}</name></metadata>\n${trks}\n</gpx>\n`
}
