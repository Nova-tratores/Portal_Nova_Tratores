import { describe, it, expect } from 'vitest'
import { deslocarDiasExecucao, primeiroDia, difDias, trocarTecnico } from '../quadro'

describe('quadro da lousa', () => {
  it('desloca os dias mantendo o horário', () => {
    expect(deslocarDiasExecucao('2026-10-20 08:00-12:00,2026-10-21', 1)).toBe('2026-10-21 08:00-12:00,2026-10-22')
  })
  it('domingo pula para segunda (indo) ou sábado (voltando)', () => {
    expect(deslocarDiasExecucao('2026-10-24', 1)).toBe('2026-10-26') // sáb + 1 = dom → seg
    expect(deslocarDiasExecucao('2026-10-26', -1)).toBe('2026-10-24') // seg − 1 = dom → sáb
  })
  it('primeiro dia e diferença', () => {
    expect(primeiroDia('2026-10-22 08:00-12:00, 2026-10-21')).toBe('2026-10-21')
    expect(primeiroDia('')).toBeNull()
    expect(difDias('2026-10-21', '2026-10-22')).toBe(1)
    expect(difDias('2026-10-24', '2026-10-20')).toBe(-4)
  })
  it('troca só o técnico da linha de onde o cartão saiu', () => {
    expect(trocarTecnico(['GABRIEL MORAES', null], 'Gabriel Moraes', 'DANILO DE SOUZA')).toEqual(['DANILO DE SOUZA', null])
    expect(trocarTecnico(['JOSE ANTONIO DE OLIVEIRA', 'FERNANDO LEONEL'], 'FERNANDO LEONEL', 'DANILO DE SOUZA')).toEqual(['JOSE ANTONIO DE OLIVEIRA', 'DANILO DE SOUZA'])
    // arrastou da linha do Fernando para a do José, que já está na OS: fica só o José
    expect(trocarTecnico(['JOSE ANTONIO DE OLIVEIRA', 'FERNANDO LEONEL'], 'FERNANDO LEONEL', 'JOSÉ ANTONIO DE OLIVEIRA')).toEqual(['JOSE ANTONIO DE OLIVEIRA', null])
    // sem técnico de origem: entra como técnico 1
    expect(trocarTecnico([null, null], null, 'GABRIEL MORAES')).toEqual(['GABRIEL MORAES', null])
  })
})
