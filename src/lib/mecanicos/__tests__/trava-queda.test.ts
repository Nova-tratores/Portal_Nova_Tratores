import { describe, expect, it } from 'vitest'
import { mesesComQueda } from '../trava-queda'

const l = (data: string, bruto: number, pecas: number) => ({ data, bruto, pecas })

describe('trava da regravação', () => {
  it('trava o mês em que as peças zeram (caso de 30/10/2026)', () => {
    const antes = [l('2026-10-05', 40000, 85000), l('2026-09-10', 30000, 50000)]
    const depois = [l('2026-10-05', 40000, 35000), l('2026-09-10', 30000, 50000)]
    expect(mesesComQueda(antes, depois)).toEqual([{ mes: '2026-10', campo: 'total', antes: 125000, depois: 75000, queda: 40 }])
  })

  it('pega a queda só das peças mesmo com o total quase igual', () => {
    expect(mesesComQueda([l('2026-07-01', 90000, 10000)], [l('2026-07-01', 92000, 6000)])[0]).toMatchObject({ mes: '2026-07', campo: 'peças', queda: 40 })
  })

  it('não trava mês que sobe, oscila pouco ou é pequeno', () => {
    expect(mesesComQueda([l('2026-10-01', 50000, 10000)], [l('2026-10-01', 52000, 12000)])).toEqual([])
    expect(mesesComQueda([l('2026-10-01', 50000, 10000)], [l('2026-10-01', 45000, 9000)])).toEqual([])
    expect(mesesComQueda([l('2026-11-01', 3000, 1000)], [])).toEqual([])
  })

  it('trava o mês que some inteiro', () => {
    expect(mesesComQueda([l('2026-08-03', 20000, 0)], [])).toEqual([{ mes: '2026-08', campo: 'total', antes: 20000, depois: 0, queda: 100 }])
  })
})
