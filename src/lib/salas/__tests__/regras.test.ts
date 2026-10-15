import { describe, it, expect } from 'vitest'
import {
  validarReserva, sobrepoe, semanaDe, diasDaSemana, localDe, isoDe, rotuloConflito, posicaoNaGrade, minutoDoY,
  reservasDoDia, fimDaReuniao, type Reserva,
} from '../regras'

const agora = { dia: '2026-10-15', hora: '10:00' }
const ok = (b: Record<string, unknown>) => validarReserva({ dia: '2026-10-16', inicio: '14:00', fim: '15:00', titulo: 'Treinamento', ...b }, agora)

describe('validarReserva', () => {
  it('aceita reserva normal e limpa o título', () => {
    const v = ok({ titulo: '  Visita cliente  ' })
    expect(v.ok && v.campos).toEqual({ dia: '2026-10-16', inicio: '14:00', fim: '15:00', titulo: 'Visita cliente', descricao: null })
  })
  it('recusa sem título, fim antes do início e fora do passo de 15 min', () => {
    expect(ok({ titulo: '' }).ok).toBe(false)
    expect(ok({ inicio: '15:00', fim: '14:00' }).ok).toBe(false)
    expect(ok({ inicio: '15:00', fim: '15:00' }).ok).toBe(false)
    expect(ok({ inicio: '14:10' }).ok).toBe(false)
  })
  it('respeita o horário da sala (06:00–22:00) e o teto de 12 h', () => {
    expect(ok({ inicio: '05:45' }).ok).toBe(false)
    expect(ok({ fim: '22:15' }).ok).toBe(false)
    expect(ok({ inicio: '06:00', fim: '22:00' }).ok).toBe(false)
    expect(ok({ inicio: '08:00', fim: '20:00' }).ok).toBe(true)
  })
  it('não reserva no passado; hoje vale enquanto o fim não passou', () => {
    expect(ok({ dia: '2026-10-14' }).ok).toBe(false)
    expect(ok({ dia: '2026-10-15', inicio: '09:00', fim: '10:00' }).ok).toBe(false)
    expect(ok({ dia: '2026-10-15', inicio: '09:30', fim: '10:30' }).ok).toBe(true)
  })
})

describe('sobreposição e semana', () => {
  const r = (i: string, f: string) => ({ inicio: isoDe('2026-10-16', i), fim: isoDe('2026-10-16', f) })
  it('encostar não conflita; cruzar conflita', () => {
    expect(sobrepoe(r('14:00', '15:00'), r('15:00', '16:00'))).toBe(false)
    expect(sobrepoe(r('14:00', '15:00'), r('14:30', '15:30'))).toBe(true)
    expect(sobrepoe(r('14:00', '17:00'), r('15:00', '16:00'))).toBe(true)
  })
  it('semana começa na segunda e vai até sábado; domingo cai na semana anterior', () => {
    expect(semanaDe('2026-10-15')).toBe('2026-10-12')
    expect(semanaDe('2026-10-18')).toBe('2026-10-12')
    expect(semanaDe('2026-10-19')).toBe('2026-10-19')
    expect(diasDaSemana('2026-10-12')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
  })
  it('localDe devolve dia e hora de Brasília', () => {
    expect(localDe('2026-10-16T17:00:00.000Z')).toEqual({ dia: '2026-10-16', hora: '14:00' })
    expect(localDe('2026-10-17T01:30:00+00:00')).toEqual({ dia: '2026-10-16', hora: '22:30' })
  })
})

describe('grade e textos', () => {
  const res = (p: Partial<Reserva>): Reserva => ({ id: 'x', sala_id: 's', inicio: isoDe('2026-10-16', '14:00'), fim: isoDe('2026-10-16', '15:30'), titulo: 'Treinamento', descricao: null, responsavel_id: 'u', criado_por: 'u', reuniao_id: null, status: 'ativa', ...p })
  it('rotuloConflito diz quem, o quê e quando', () => {
    expect(rotuloConflito({ ...res({}), responsavel_nome: 'Larissa Garcia' })).toBe('Ocupada por Larissa · Treinamento · 14:00–15:30')
  })
  it('posição na grade (60 px/h, grade das 7h)', () => {
    expect(posicaoNaGrade(res({}).inicio, res({}).fim, 60)).toEqual({ top: 420, altura: 90 })
  })
  it('minutoDoY arredonda para o passo de 15 min', () => {
    expect(minutoDoY(0, 60)).toBe(7 * 60)
    expect(minutoDoY(425, 60)).toBe(14 * 60)
    expect(minutoDoY(440, 60)).toBe(14 * 60 + 15)
  })
  it('reservasDoDia ignora canceladas e outros dias', () => {
    const lista = [res({ id: 'b', inicio: isoDe('2026-10-16', '16:00') }), res({ id: 'a' }), res({ id: 'c', status: 'cancelada' }), res({ id: 'd', inicio: isoDe('2026-10-17', '09:00') })]
    expect(reservasDoDia(lista, '2026-10-16').map((r) => r.id)).toEqual(['a', 'b'])
  })
  it('fimDaReuniao soma a duração', () => {
    expect(fimDaReuniao('10:00', 30)).toBe('10:30')
    expect(fimDaReuniao('15:00:00', 90)).toBe('16:30')
  })
})
