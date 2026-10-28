import { describe, expect, it } from 'vitest'
import { camposDoItem, planejarSincronizacao, segundaDa, validarSemana, type EventoRotaDb, type ItemRota } from '../rota-vendas'

const item = (ref: string, dia = '2026-10-21', horaIni = '08:00', horaFim = '09:30', titulo = 'Visita: ' + ref): ItemRota =>
  ({ ref, dia, horaIni, horaFim, titulo, local: 'Piraju', descricao: null })

const doBanco = (id: string, it: ItemRota): EventoRotaDb => ({ id, ...camposDoItem(it) })

describe('segundaDa', () => {
  it('acha a segunda-feira da semana', () => {
    expect(segundaDa('2026-10-21')).toBe('2026-10-19') // quarta
    expect(segundaDa('2026-10-19')).toBe('2026-10-19') // segunda
    expect(segundaDa('2026-10-25')).toBe('2026-10-19') // domingo
  })
})

describe('validarSemana', () => {
  it('aceita a semana e normaliza para a segunda', () => {
    const v = validarSemana({ semana: '2026-10-22', itens: [item('c:1')] })
    expect(v.ok && v.semana).toBe('2026-10-19')
  })
  it('recusa dia fora da semana, horário invertido e ref repetida', () => {
    expect(validarSemana({ semana: '2026-10-19', itens: [item('c:1', '2026-10-27')] }).ok).toBe(false)
    expect(validarSemana({ semana: '2026-10-19', itens: [item('c:1', '2026-10-21', '10:00', '09:00')] }).ok).toBe(false)
    expect(validarSemana({ semana: '2026-10-19', itens: [item('c:1'), item('c:1', '2026-10-22')] }).ok).toBe(false)
  })
  it('horário vira instante em -03:00', () => {
    expect(camposDoItem(item('c:1')).inicio).toBe('2026-10-21T11:00:00.000Z')
  })
})

describe('planejarSincronizacao', () => {
  it('primeira publicação cria tudo', () => {
    const p = planejarSincronizacao([], [item('c:1'), item('c:2', '2026-10-22')])
    expect(p.criar).toHaveLength(2)
    expect(p.atualizar).toHaveLength(0)
    expect(p.cancelar).toHaveLength(0)
  })
  it('republicar igual não mexe em nada', () => {
    const its = [item('c:1'), item('c:2', '2026-10-22')]
    const p = planejarSincronizacao([doBanco('a', its[0]), doBanco('b', its[1])], its)
    expect(p).toEqual({ criar: [], atualizar: [], cancelar: [], iguais: 2 })
  })
  it('mudou o horário → atualiza; saiu da rota → cancela; novo → cria', () => {
    const antes = [doBanco('a', item('c:1')), doBanco('b', item('c:2'))]
    const p = planejarSincronizacao(antes, [item('c:1', '2026-10-21', '10:00', '11:30'), item('c:3')])
    expect(p.atualizar.map((a) => a.id)).toEqual(['a'])
    expect(p.cancelar).toEqual(['b'])
    expect(p.criar.map((c) => c.origem_ref)).toEqual(['c:3'])
  })
})
