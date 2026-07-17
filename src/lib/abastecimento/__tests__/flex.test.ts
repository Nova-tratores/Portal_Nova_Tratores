import { describe, expect, it } from 'vitest'
import { avaliarKmL, classificarCombustivel, compararFlex, type FlexRow } from '../flex'

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
  it('quem usou só UM combustível APARECE, mas sem veredito (só gasolina)', () => {
    // antes o veículo sumia da tela — escondia que ele nunca testou o etanol
    const rows = [abast({}), abast({ hodometro_anterior: 10400, hodometro: 10800 })]
    const lista = compararFlex(rows)
    expect(lista).toHaveLength(1)
    expect(lista[0].veredito).toBeNull()
    expect(lista[0].gasolina.abastecimentos).toBe(2)
    expect(lista[0].etanol.abastecimentos).toBe(0)
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

describe('avaliarKmL — a régua exposta pro detalhe da tela', () => {
  it('classifica ok / sem hodômetro / km-l implausível', () => {
    expect(avaliarKmL({ litros: 40, hodometro_anterior: 10000, hodometro: 10400 }))
      .toEqual({ km: 400, kml: 10, valido: true, motivo: 'ok' })
    expect(avaliarKmL({ litros: 40, hodometro_anterior: null, hodometro: 10400 }).motivo)
      .toBe('sem_hodometro')
    expect(avaliarKmL({ litros: 40, hodometro_anterior: 10400, hodometro: 10000 }).motivo)
      .toBe('sem_hodometro') // hodômetro andou pra trás = digitação errada
    const implausivel = avaliarKmL({ litros: 10, hodometro_anterior: 10000, hodometro: 10400 })
    expect(implausivel.motivo).toBe('kml_implausivel') // 40 km/l
    expect(implausivel.kml).toBe(40)
    expect(implausivel.valido).toBe(false)
  })

  it('é a MESMA régua do compararFlex (um válido conta, um implausível não)', () => {
    const rows: FlexRow[] = [
      { placa: 'AAA1234', modelo_veiculo: null, combustivel: 'Gasolina', litros: 40, valor_total: 240, hodometro_anterior: 10000, hodometro: 10400 },
      { placa: 'AAA1234', modelo_veiculo: null, combustivel: 'Gasolina', litros: 10, valor_total: 60, hodometro_anterior: 10400, hodometro: 10800 },
      { placa: 'AAA1234', modelo_veiculo: null, combustivel: 'Etanol', litros: 40, valor_total: 180, hodometro_anterior: 10800, hodometro: 11200 },
    ]
    const [v] = compararFlex(rows)
    expect(v.gasolina.validos).toBe(1)
    expect(rows.map((r) => avaliarKmL(r).valido)).toEqual([true, false, true])
  })
})
