import { describe, it, expect } from 'vitest'
import { validarBloqueio, mensagemIndisponiveis, fatiarPorDia, bloqueioNaGrade } from '../bloqueios'
import { isoDe } from '@/lib/salas/regras'

const agora = { dia: '2026-10-19', hora: '10:00' }

describe('validarBloqueio', () => {
  it('horário: aceita e guarda o motivo', () => {
    const v = validarBloqueio({ dia: '2026-10-20', inicio: '14:00', fim: '16:00', motivo: ' Médico ' }, agora)
    expect(v.ok && v.campos).toEqual({ inicio: isoDe('2026-10-20', '14:00'), fim: isoDe('2026-10-20', '16:00'), motivo: 'Médico' })
  })
  it('horário: recusa passado, fim antes do início e fora do passo', () => {
    expect(validarBloqueio({ dia: '2026-10-18', inicio: '14:00', fim: '15:00' }, agora).ok).toBe(false)
    expect(validarBloqueio({ dia: '2026-10-19', inicio: '08:00', fim: '09:00' }, agora).ok).toBe(false)
    expect(validarBloqueio({ dia: '2026-10-20', inicio: '15:00', fim: '14:00' }, agora).ok).toBe(false)
    expect(validarBloqueio({ dia: '2026-10-20', inicio: '14:10', fim: '15:00' }, agora).ok).toBe(false)
  })
  it('dia inteiro: um dia e período (férias) viram meia-noite a meia-noite', () => {
    const um = validarBloqueio({ dia_inteiro: true, de: '2026-10-20' }, agora)
    expect(um.ok && um.campos.inicio).toBe(isoDe('2026-10-20', '00:00'))
    expect(um.ok && um.campos.fim).toBe(isoDe('2026-10-21', '00:00'))
    const ferias = validarBloqueio({ dia_inteiro: true, de: '2026-11-02', ate: '2026-11-13' }, agora)
    expect(ferias.ok && ferias.campos.fim).toBe(isoDe('2026-11-14', '00:00'))
  })
  it('dia inteiro: recusa período invertido, passado ou maior que 62 dias', () => {
    expect(validarBloqueio({ dia_inteiro: true, de: '2026-11-10', ate: '2026-11-01' }, agora).ok).toBe(false)
    expect(validarBloqueio({ dia_inteiro: true, de: '2026-10-01', ate: '2026-10-10' }, agora).ok).toBe(false)
    expect(validarBloqueio({ dia_inteiro: true, de: '2026-11-01', ate: '2027-01-15' }, agora).ok).toBe(false)
  })
})

describe('mensagem e grade', () => {
  it('mensagemIndisponiveis usa o primeiro nome e concorda no plural', () => {
    expect(mensagemIndisponiveis([{ usuario_id: 'a', nome: 'Larissa Garcia' }])).toBe('Está indisponível nesse horário: Larissa')
    expect(mensagemIndisponiveis([{ usuario_id: 'a', nome: 'Larissa Garcia' }, { usuario_id: 'b', nome: 'Vinicius Correa' }, { usuario_id: 'c', nome: 'José Ortiz' }]))
      .toBe('Estão indisponíveis nesse horário: Larissa, Vinicius e José')
    expect(mensagemIndisponiveis([])).toBe('')
  })
  it('fatiarPorDia corta férias em um pedaço por dia', () => {
    const p = fatiarPorDia(isoDe('2026-11-02', '00:00'), isoDe('2026-11-05', '00:00'))
    expect(p.map((x) => x.dia)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
    expect(fatiarPorDia(isoDe('2026-10-20', '14:00'), isoDe('2026-10-20', '16:00'))).toHaveLength(1)
  })
  it('bloqueioNaGrade vira bloco cinza com o motivo (ou "Indisponível")', () => {
    const b = bloqueioNaGrade({ id: 'x', user_id: 'u', inicio: isoDe('2026-10-20', '14:00'), fim: isoDe('2026-10-20', '16:00'), motivo: null }, 'u')
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ titulo: 'Indisponível', cor: '#64748b', reuniao_id: null })
  })
})
