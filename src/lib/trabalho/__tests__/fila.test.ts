import { describe, it, expect } from 'vitest'
import { ordenarFila, planejarFila, atrasoPrevisto, diasUteisEntre, type ItemFila } from '../fila'

// 2026-10-07 é quarta; 12/10 (segunda) é feriado nacional.
const FERIADOS = new Set(['2026-10-12'])
const item = (id: string, dias: number, horasDia: number, extra: Partial<ItemFila> = {}): ItemFila =>
  ({ id, numero: Number(id.replace(/\D/g, '')) || 0, prazo: null, urgente: false, dias, horasDia, ...extra })

describe('fila — ordem', () => {
  it('urgente no topo, depois a ordem manual, depois o prazo', () => {
    const itens = [
      item('t1', 1, 9, { prazo: '2026-10-20' }),
      item('t2', 1, 9, { prazo: '2026-10-09' }),
      item('t3', 1, 9, { urgente: true }),
      item('t4', 1, 9, { prazo: '2026-10-30' }),
    ]
    const ordem = ordenarFila(itens, new Map([['t4', 0]])).map((t) => t.id)
    expect(ordem).toEqual(['t3', 't4', 't2', 't1'])
  })
})

describe('fila — planejamento', () => {
  it('um ticket por vez quando cada um usa o dia inteiro', () => {
    const p = planejarFila([item('a', 2, 9), item('b', 1, 9)], '2026-10-07', FERIADOS)
    expect(p.get('a')).toMatchObject({ inicio: '2026-10-07', fim: '2026-10-08' })
    expect(p.get('b')).toMatchObject({ inicio: '2026-10-09', fim: '2026-10-09' })
  })
  it('dois no mesmo dia quando cabe nas horas', () => {
    const p = planejarFila([item('a', 1, 4), item('b', 1, 5)], '2026-10-07', FERIADOS)
    expect(p.get('a')!.inicio).toBe('2026-10-07')
    expect(p.get('b')!.inicio).toBe('2026-10-07')
  })
  it('pula fim de semana e feriado', () => {
    // sex 09 → (sáb, dom, seg feriado) → ter 13
    const p = planejarFila([item('a', 2, 9)], '2026-10-09', FERIADOS)
    expect(p.get('a')).toMatchObject({ inicio: '2026-10-09', fim: '2026-10-13' })
  })
  it('o que sobra do dia vai para o próximo da fila', () => {
    // a usa 6h/dia por 2 dias; b (9h/dia, 1 dia = 9h) pega 3h na qua, 3h na qui e 3h na sex
    const p = planejarFila([item('a', 2, 6), item('b', 1, 9)], '2026-10-07', FERIADOS)
    expect(p.get('b')).toMatchObject({ inicio: '2026-10-07', fim: '2026-10-09' })
  })
})

describe('fila — atraso e dias úteis', () => {
  it('atraso previsto = dias depois do prazo', () => {
    expect(atrasoPrevisto('2026-10-09', { inicio: '2026-10-13', fim: '2026-10-14', horas: 9 })).toBe(5)
    expect(atrasoPrevisto('2026-10-20', { inicio: '2026-10-13', fim: '2026-10-14', horas: 9 })).toBe(0)
    expect(atrasoPrevisto(null, { inicio: '2026-10-13', fim: '2026-10-14', horas: 9 })).toBe(0)
  })
  it('conta só dias úteis', () => {
    expect(diasUteisEntre('2026-10-09', '2026-10-13', FERIADOS)).toBe(2)
  })
})

describe('fila — contínuo (prazo indeterminado)', () => {
  it('reserva as horas dele todo dia e empurra o resto', () => {
    // contínuo de 3 h/dia: sobra 6 h/dia; ticket de 1 dia × 9 h = 9 h → qua 6 h + qui 3 h
    const p = planejarFila([item('c', 1, 3, { continuo: true }), item('a', 1, 9)], '2026-10-07', FERIADOS)
    expect(p.get('c')).toMatchObject({ inicio: '2026-10-07', fim: '' })
    expect(p.get('a')).toMatchObject({ inicio: '2026-10-07', fim: '2026-10-08' })
  })
})
