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

import { lerSolicitacao, trocarSolicitacao, novoValorTotal, numeroOS } from '../quadro'
describe('ficha da OS na lousa', () => {
  const txt = 'Modelo: 6060\nChassis: MBNY\nHorimetro: \n\nSolicitação do cliente: RADIADOR FURADO\nServiço Realizado: trocou o radiador'
  it('lê e troca só a solicitação', () => {
    expect(lerSolicitacao(txt)).toBe('RADIADOR FURADO')
    expect(trocarSolicitacao(txt, 'Radiador furado e tração')).toBe('Modelo: 6060\nChassis: MBNY\nHorimetro: \n\nSolicitação do cliente: Radiador furado e tração\nServiço Realizado: trocou o radiador')
  })
  it('sem marcador, acrescenta', () => {
    expect(trocarSolicitacao('', 'Revisão')).toBe('Solicitação do cliente: Revisão\nServiço Realizado: ')
    expect(lerSolicitacao(trocarSolicitacao('Modelo: X', 'Revisão'))).toBe('Revisão')
  })
  it('valor da OS anda com horas e km', () => {
    expect(novoValorTotal('200', { antes: '1', depois: '3', valor: 200 }, { antes: '0', depois: '40', valor: 3.6 })).toBe(744)
    expect(novoValorTotal('200', { antes: '1', depois: '1', valor: 200 }, { antes: '0', depois: '0', valor: 3.6 })).toBe(200)
    expect(numeroOS('1,5')).toBe(1.5)
  })
})
