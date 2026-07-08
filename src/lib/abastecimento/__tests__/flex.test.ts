import { describe, expect, it } from 'vitest'
import { classificarCombustivel, compararFlex, type FlexRow } from '../flex'

function abast(p: Partial<FlexRow>): FlexRow {
  return {
    placa: 'AAA1B23',
    modelo_veiculo: 'ONIX',
    combustivel: 'Gasolina Comum',
    litros: 40,
    valor_total: 240,
    hodometro_anterior: 10000,
    hodometro: 10400,
    ...p,
  }
}

describe('classificarCombustivel', () => {
  it('agrupa variantes', () => {
    expect(classificarCombustivel('Etanol')).toBe('etanol')
    expect(classificarCombustivel('Álcool')).toBe('etanol')
    expect(classificarCombustivel('Gasolina Aditivada')).toBe('gasolina')
    expect(classificarCombustivel('Diesel S50')).toBeNull()
    expect(classificarCombustivel(null)).toBeNull()
  })
})

describe('compararFlex', () => {
  it('só devolve veículos que usaram os dois combustíveis', () => {
    const rows = [abast({}), abast({ hodometro_anterior: 10400, hodometro: 10800 })]
    expect(compararFlex(rows)).toHaveLength(0) // só gasolina
  })

  it('calcula km/l e R$/km por combustível e dá o veredito pelo custo/km', () => {
    const rows: FlexRow[] = [
      // gasolina: 800 km / 80 l = 10 km/l · R$480/800km = R$0,60/km
      abast({ hodometro_anterior: 10000, hodometro: 10400, litros: 40, valor_total: 240 }),
      abast({ hodometro_anterior: 10400, hodometro: 10800, litros: 40, valor_total: 240 }),
      // etanol: 560 km / 80 l = 7 km/l · R$320/560km = R$0,571/km → etanol vence
      abast({ combustivel: 'Etanol', hodometro_anterior: 10800, hodometro: 11080, litros: 40, valor_total: 160 }),
      abast({ combustivel: 'Etanol', hodometro_anterior: 11080, hodometro: 11360, litros: 40, valor_total: 160 }),
    ]
    const [v] = compararFlex(rows)
    expect(v.gasolina.kmPorLitro).toBeCloseTo(10, 5)
    expect(v.gasolina.custoPorKm).toBeCloseTo(0.6, 5)
    expect(v.etanol.kmPorLitro).toBeCloseTo(7, 5)
    expect(v.etanol.custoPorKm).toBeCloseTo(320 / 560, 5)
    expect(v.veredito).toBe('etanol')
    expect(v.economiaPct).toBeCloseTo((0.6 - 320 / 560) / 0.6, 5)
  })

  it('descarta hodômetro digitado errado mas mantém o abastecimento no total', () => {
    const rows: FlexRow[] = [
      abast({}), // válido
      abast({ hodometro_anterior: 10400, hodometro: 10300 }), // andou pra trás
      abast({ hodometro_anterior: 10400, hodometro: 99999, litros: 10 }), // km/l absurdo
      abast({ hodometro_anterior: null, hodometro: 10500 }), // sem leitura
      abast({ combustivel: 'Etanol' }),
    ]
    const [v] = compararFlex(rows)
    expect(v.gasolina.abastecimentos).toBe(4)
    expect(v.gasolina.validos).toBe(1)
    expect(v.veredito).toBeNull() // amostra insuficiente (mínimo 2 válidos de cada)
  })

  it('empata quando a diferença de custo/km é < 3%', () => {
    const rows: FlexRow[] = [
      abast({ hodometro_anterior: 10000, hodometro: 10400, litros: 40, valor_total: 240 }),
      abast({ hodometro_anterior: 10400, hodometro: 10800, litros: 40, valor_total: 240 }),
      abast({ combustivel: 'Etanol', hodometro_anterior: 10800, hodometro: 11200, litros: 40, valor_total: 241 }),
      abast({ combustivel: 'Etanol', hodometro_anterior: 11200, hodometro: 11600, litros: 40, valor_total: 241 }),
    ]
    const [v] = compararFlex(rows)
    expect(v.veredito).toBe('empate')
  })
})
