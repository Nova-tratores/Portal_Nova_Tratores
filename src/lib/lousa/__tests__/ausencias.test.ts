import { describe, it, expect } from 'vitest'
import { validarLancamento, diasDasFerias, quantidadeRH, horarioDe, observacaoRH, type Lancamento } from '../ausencias'

const base: Lancamento = { tipo: 'falta', dia: '2026-10-21', duracao: 'dia', tecnicos: ['t1'], justificada: false }

describe('lançamentos fora de OS', () => {
  it('valida falta, médico e férias', () => {
    expect(validarLancamento(base)).toBeNull()
    expect(validarLancamento({ ...base, justificada: null })).toMatch(/justificada/)
    expect(validarLancamento({ ...base, justificada: true })).toMatch(/motivo/)
    expect(validarLancamento({ ...base, justificada: true, motivo: 'velório' })).toBeNull()
    expect(validarLancamento({ ...base, tipo: 'medico', justificada: null })).toMatch(/atestado/)
    expect(validarLancamento({ ...base, tipo: 'medico', temAnexo: true })).toBeNull()
    expect(validarLancamento({ ...base, tipo: 'ferias', diasFerias: 31 })).toMatch(/1 a 30/)
    expect(validarLancamento({ ...base, tipo: 'ferias', diasFerias: 15 })).toBeNull()
    expect(validarLancamento({ ...base, tecnicos: [] })).toMatch(/técnico/)
  })
  it('horário personalizado', () => {
    expect(validarLancamento({ ...base, duracao: 'horas', horaInicio: '10:00', horaFim: '09:00' })).toMatch(/depois/)
    expect(validarLancamento({ ...base, duracao: 'horas', horaInicio: '08:00', horaFim: '10:30' })).toBeNull()
    expect(quantidadeRH({ duracao: 'horas', horaInicio: '08:00', horaFim: '10:30' })).toEqual({ quantidade: 2.5, unidade: 'horas' })
  })
  it('quantidade para o Ponto do RH', () => {
    expect(quantidadeRH({ duracao: 'dia' })).toEqual({ quantidade: 1, unidade: 'dias' })
    expect(quantidadeRH({ duracao: 'manha' })).toEqual({ quantidade: 4, unidade: 'horas' })
    expect(horarioDe({ duracao: 'tarde' })).toEqual({ ini: '13:00', fim: '18:00' })
  })
  it('dias corridos das férias', () => {
    expect(diasDasFerias('2026-10-26', 3)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28'])
    expect(diasDasFerias('2026-10-30', 3)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })
  it('observação que vai para o RH', () => {
    expect(observacaoRH({ ...base, justificada: true, motivo: 'velório', duracao: 'manha' }, 'Larissa')).toBe('[Lousa] Falta JUSTIFICADA · 08:00–12:00 · motivo: velório · lançado por Larissa')
  })
})
