import { describe, expect, it } from 'vitest'
import {
  IndiceVias, caixaTile, celulasDoTrecho, chaveTile, classificarDia, consultaOverpass, distPontoSegmentoM,
  estiloPassagens, frequenciaTrechos, gerarGpx, malhaDoOverpass, pontasDoTrecho, tilesDoDia,
  type MalhaTile, type ParadaLida, type TrechoLido,
} from '../vias-fora-mapa'
import type { PontoGps } from '../gps'

// Estrada reta leste-oeste em lat -23.25 cortando o quadrante -233_-494.
const LAT_VIA = -23.25
const malha: MalhaTile = { v: 1, tile: '-233_-494', baixado_em: '2026-10-22T00:00:00Z', vias: [[LAT_VIA, -49.39, LAT_VIA, -49.31]] }
const M_LAT = 1 / 110_574 // graus por metro (latitude)

function indice() {
  const i = new IndiceVias()
  i.adicionarMalha(malha)
  return i
}

/** Pontos a cada 10 s andando para leste, deslocados `offsetM(k)` metros ao norte da via. */
function trajeto(n: number, offsetM: (k: number) => number, vel = 30): PontoGps[] {
  const t0 = Date.parse('2026-10-20T12:00:00Z')
  return Array.from({ length: n }, (_, k) => ({
    lat: LAT_VIA + offsetM(k) * M_LAT,
    lng: -49.38 + k * 0.0008, // ~82 m por ponto
    dt: new Date(t0 + k * 10_000).toISOString(),
    vel,
    ignicao: 1,
  }))
}

describe('quadrantes', () => {
  it('chave e caixa com folga', () => {
    expect(chaveTile(-23.2085, -49.3709)).toBe('-233_-494')
    const [s, w, n, e] = caixaTile('-233_-494')
    expect(s).toBeCloseTo(-23.304, 6)
    expect(w).toBeCloseTo(-49.404, 6)
    expect(n).toBeCloseTo(-23.196, 6)
    expect(e).toBeCloseTo(-49.296, 6)
    expect(consultaOverpass('-233_-494')).toContain('(-23.304,-49.404,-23.196,-49.296)')
    expect(consultaOverpass('-233_-494')).toContain('footway')
  })

  it('malha do Overpass: ignora o que não é via e recusa resposta cortada', () => {
    const m = malhaDoOverpass('x', { elements: [
      { type: 'way', geometry: [{ lat: 1.1234567, lon: 2 }, { lat: 1.2, lon: 2.1 }] },
      { type: 'way', geometry: [{ lat: 1, lon: 2 }] },
      { type: 'node', lat: 1, lon: 1 },
    ] }, 'agora')
    expect(m.vias).toEqual([[1.123457, 2, 1.2, 2.1]])
    expect(() => malhaDoOverpass('x', { elements: [], remark: 'runtime error: Query timed out' }, 'agora')).toThrow(/timed out/)
    expect(() => malhaDoOverpass('x', {}, 'agora')).toThrow()
  })
})

describe('distância até a via', () => {
  it('ponto-segmento em metros', () => {
    expect(distPontoSegmentoM(LAT_VIA + 100 * M_LAT, -49.35, LAT_VIA, -49.39, LAT_VIA, -49.31)).toBeCloseTo(100, 0)
    // depois da ponta do segmento: mede até a ponta
    expect(distPontoSegmentoM(LAT_VIA, -49.30, LAT_VIA, -49.39, LAT_VIA, -49.31)).toBeGreaterThan(1000)
  })

  it('índice acha a via; longe de tudo devolve o teto', () => {
    const i = indice()
    expect(i.distanciaM(LAT_VIA + 30 * M_LAT, -49.35)).toBeCloseTo(30, 0)
    expect(i.distanciaM(LAT_VIA + 5000 * M_LAT, -49.35)).toBe(500)
    expect(i.temTile('-233_-494')).toBe(true)
  })
})

describe('classificarDia', () => {
  it('carro na estrada o tempo todo: nenhum trecho', () => {
    const r = classificarDia(trajeto(40, () => 8), indice())
    expect(r.trechos).toEqual([])
    expect(r.pontosAndando).toBe(40)
    expect(r.tilesFaltando).toEqual([])
  })

  it('sai da estrada por ~1 km e volta: um trecho ligado à via nas duas pontas', () => {
    // pontos 10..21 a 150 m da via
    const pts = trajeto(40, (k) => (k >= 10 && k <= 21 ? 150 : 5))
    const r = classificarDia(pts, indice())
    expect(r.trechos).toHaveLength(1)
    const t = r.trechos[0]
    expect(t.inicio).toBe(pts[10].dt)
    expect(t.fim).toBe(pts[21].dt)
    expect(t.pontos).toHaveLength(14) // 12 fora + o de antes + o de depois
    expect(t.dist_max_m).toBeCloseTo(150, -1)
    expect(t.km).toBeGreaterThan(0.9)
    expect(t.vel_mediana).toBe(30)
  })

  it('um ponto só de volta à via no meio não quebra o trecho', () => {
    const r = classificarDia(trajeto(40, (k) => (k >= 10 && k <= 25 && k !== 17 ? 150 : 5)), indice())
    expect(r.trechos).toHaveLength(1)
  })

  it('GPS deslocado ao lado da rodovia (45–55 m) não vira trecho', () => {
    const r = classificarDia(trajeto(40, (k) => (k >= 10 && k <= 30 ? 50 : 5)), indice())
    expect(r.trechos).toEqual([])
  })

  it('manobra curta e carro parado não contam', () => {
    expect(classificarDia(trajeto(40, (k) => (k === 10 || k === 11 ? 150 : 5)), indice()).trechos).toEqual([])
    const parado = trajeto(40, (k) => (k >= 10 && k <= 21 ? 150 : 5), 0)
    const r = classificarDia(parado, indice())
    expect(r.pontosAndando).toBe(0)
    expect(r.trechos).toEqual([])
  })

  it('quadrante sem malha: não classifica e diz qual falta', () => {
    const r = classificarDia(trajeto(10, () => 150), new IndiceVias())
    expect(r.trechos).toEqual([])
    expect(r.tilesFaltando).toEqual(['-233_-494'])
    expect(tilesDoDia(trajeto(10, () => 150))).toEqual(['-233_-494'])
  })
})

describe('frequência das passagens', () => {
  const via: [number, number, number][] = [[-23.30, -49.40, 20], [-23.30, -49.39, 20]]
  const t = (id: number, placa: string, data: string, pontos = via): TrechoLido => ({ id, placa, data, pontos })

  it('células interpolam entre pontos distantes', () => {
    expect(celulasDoTrecho(via).size).toBeGreaterThanOrEqual(20)
  })

  it('conta carro+dia distintos e aponta a mesma via', () => {
    const f = frequenciaTrechos([
      t(1, 'AAA1111', '2026-10-01'),
      t(2, 'AAA1111', '2026-10-01'), // mesmo carro, mesmo dia (volta) = 1 passagem
      t(3, 'BBB2222', '2026-10-01'),
      t(4, 'AAA1111', '2026-10-05'),
      t(5, 'CCC3333', '2026-10-05', [[-23.10, -49.10, 20], [-23.10, -49.09, 20]]),
    ])
    expect(f.passagens.get(1)).toBe(3)
    expect(f.passagens.get(5)).toBe(1)
    expect(f.mesmaVia.get(1)?.sort()).toEqual([2, 3, 4])
    expect(f.mesmaVia.get(5)).toEqual([])
    expect(estiloPassagens(3).rotulo).toBe('2 a 4 passagens')
    expect(estiloPassagens(7).peso).toBeGreaterThan(estiloPassagens(1).peso)
  })
})

describe('de onde vinha / para onde ia', () => {
  const p = (inicio: string, fim: string, extra: Partial<ParadaLida> = {}): ParadaLida => ({
    inicio, fim, duracao_min: 20, classe: 'fora_geocerca', destino_nome: null, justificativa: null, endereco: null, ...extra,
  })
  it('pega a parada logo antes e a logo depois', () => {
    const r = pontasDoTrecho({ inicio: '2026-10-20T13:00:00Z', fim: '2026-10-20T13:20:00Z' }, [
      p('2026-10-20T10:00:00Z', '2026-10-20T10:30:00Z', { classe: 'loja' }), // longe demais
      p('2026-10-20T12:30:00Z', '2026-10-20T12:58:00Z', { classe: 'loja' }),
      p('2026-10-20T13:22:00Z', '2026-10-20T14:00:00Z', { classe: 'cliente_portal', destino_nome: 'Sítio Recanto Verde' }),
      p('2026-10-20T15:00:00Z', '2026-10-20T15:30:00Z'),
    ])
    expect(r.de?.rotulo).toBe('Loja')
    expect(r.para?.rotulo).toBe('Cliente Sítio Recanto Verde')
    expect(r.para?.conhecido).toBe(true)
  })
  it('parada sem cadastro usa a justificativa; sem parada perto = null', () => {
    const r = pontasDoTrecho({ inicio: '2026-10-20T13:00:00Z', fim: '2026-10-20T13:20:00Z' }, [
      p('2026-10-20T13:30:00Z', '2026-10-20T14:00:00Z', { justificativa: 'Entrega de peça' }),
    ])
    expect(r.para).toMatchObject({ rotulo: 'Entrega de peça', conhecido: false })
    expect(r.de).toBeNull()
  })
})

describe('GPX', () => {
  it('um track por trecho, nome escapado', () => {
    const gpx = gerarGpx([{ id: 1, placa: 'A&B', data: '2026-10-20', inicio: '', km: 1.5, pontos: [[-23.3, -49.4, 0], [-23.31, -49.41, 0]] }])
    expect(gpx).toContain('<trk><name>A&amp;B · 20/10/2026 · 1,5 km</name>')
    expect(gpx.match(/<trkpt /g)).toHaveLength(2)
  })
})
