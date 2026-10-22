import { describe, expect, it } from 'vitest'
import { diasDaOS, paradasCandidatas, coordenadaValida, distanciaM, LOJA, type ParadaGPS } from '../localizacao-cliente'

const p = (x: Partial<ParadaGPS>): ParadaGPS => ({ placa: 'ABC1D23', tecnico: 'Gabriel', data: '2026-10-20', inicio: '2026-10-20T13:00:00Z', fim: null, duracaoMin: 45, lat: -23.1, lng: -49.2, ...x })

describe('localização do cliente pelo GPS', () => {
  it('dias: lista da OS + relatório, sem repetir; previsão só sem nada', () => {
    expect(diasDaOS('2026-10-20 08:00-12:00,2026-10-21', ['2026-10-21', '2026-10-22'], '2026-10-01')).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
    expect(diasDaOS('', [], '2026-10-01T00:00')).toEqual(['2026-10-01'])
    expect(diasDaOS(null, [], null)).toEqual([])
  })
  it('paradas: só ≥ 30 min, fora da loja, mais longas primeiro, acompanhado por último', () => {
    const r = paradasCandidatas([
      p({ inicio: '2026-10-20T13:00:00Z', duracaoMin: 20 }),
      p({ inicio: '2026-10-20T13:00:01Z', duracaoMin: 90, lat: LOJA.lat + 0.001, lng: LOJA.lng }), // ~110 m da loja
      p({ inicio: '2026-10-20T13:00:02Z', duracaoMin: 60, classe: 'loja' }),
      p({ inicio: '2026-10-20T13:00:03Z', duracaoMin: 40 }),
      p({ inicio: '2026-10-20T13:00:04Z', duracaoMin: 200, acompanhado: true }),
      p({ inicio: '2026-10-20T13:00:05Z', duracaoMin: 120 }),
      p({ inicio: '2026-10-20T13:00:05Z', duracaoMin: 120 }),
    ])
    expect(r.map((x) => x.inicio.slice(-2))).toEqual(['5Z', '3Z', '4Z'])
  })
  it('coordenada e distância', () => {
    expect(coordenadaValida(-23.2, -49.3)).toBe(true)
    expect(coordenadaValida(0, 0)).toBe(false)
    expect(coordenadaValida(40, -49)).toBe(false)
    expect(Math.round(distanciaM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) / 1000)).toBe(111)
  })
})

import { minutosNoExpediente } from '../localizacao-cliente'
describe('expediente 07h–19h', () => {
  it('pernoite no hotel quase não conta; parada de dia conta inteira', () => {
    // 00h07–09h58 de Brasília → só 07h–09h58
    expect(minutosNoExpediente('2026-10-21T03:07:49Z', '2026-10-21T12:58:34Z', 591)).toBe(179)
    expect(minutosNoExpediente('2026-10-21T14:26:04Z', '2026-10-21T20:01:05Z', 335)).toBe(335)
    // 20h–06h: nada
    expect(minutosNoExpediente('2026-10-21T23:00:00Z', '2026-10-22T09:00:00Z', 600)).toBe(0)
  })
})
