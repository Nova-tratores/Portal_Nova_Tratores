import { describe, it, expect } from 'vitest'
import { reaisPorExtenso, inteiroPorExtenso } from '../extenso'

describe('inteiroPorExtenso', () => {
  it.each([
    [0, 'zero'], [1, 'um'], [15, 'quinze'], [21, 'vinte e um'], [100, 'cem'], [101, 'cento e um'],
    [110, 'cento e dez'], [999, 'novecentos e noventa e nove'], [1000, 'mil'], [1001, 'mil e um'],
    [1100, 'mil e cem'], [1234, 'mil, duzentos e trinta e quatro'], [2000, 'dois mil'],
    [21500, 'vinte e um mil e quinhentos'], [100000, 'cem mil'], [1000000, 'um milhão'],
    [2500000, 'dois milhões e quinhentos mil'], [1000001, 'um milhão e um'],
    [1234567, 'um milhão, duzentos e trinta e quatro mil, quinhentos e sessenta e sete'],
  ])('%i → %s', (n, txt) => expect(inteiroPorExtenso(n)).toBe(txt))
})

describe('reaisPorExtenso', () => {
  it.each([
    [1, 'um real'], [0.01, 'um centavo'], [0.5, 'cinquenta centavos'], [2, 'dois reais'],
    [1.01, 'um real e um centavo'], [150.75, 'cento e cinquenta reais e setenta e cinco centavos'],
    [1234.5, 'mil, duzentos e trinta e quatro reais e cinquenta centavos'],
    [1000000, 'um milhão de reais'], [3000000, 'três milhões de reais'],
    [1500000, 'um milhão e quinhentos mil reais'], [0, 'zero real'],
    [0.1 + 0.2, 'trinta centavos'],
  ])('%d → %s', (v, txt) => expect(reaisPorExtenso(v)).toBe(txt))
})
