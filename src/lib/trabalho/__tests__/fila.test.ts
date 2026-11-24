import { describe, it, expect } from 'vitest'
import { ordenarFila, planejarFila, atrasoPrevisto, diasUteisEntre, CAPACIDADE_PADRAO, type ItemFila } from '../fila'

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
    const p = planejarFila([item('a', 2, 9), item('b', 1, 9)], '2026-10-07', FERIADOS, 9)
    expect(p.get('a')).toMatchObject({ inicio: '2026-10-07', fim: '2026-10-08' })
    expect(p.get('b')).toMatchObject({ inicio: '2026-10-09', fim: '2026-10-09' })
  })
  it('dois no mesmo dia quando cabe nas horas', () => {
    const p = planejarFila([item('a', 1, 4), item('b', 1, 5)], '2026-10-07', FERIADOS, 9)
    expect(p.get('a')!.inicio).toBe('2026-10-07')
    expect(p.get('b')!.inicio).toBe('2026-10-07')
  })
  it('pula fim de semana e feriado', () => {
    // sex 09 → (sáb, dom, seg feriado) → ter 13
    const p = planejarFila([item('a', 2, 9)], '2026-10-09', FERIADOS, 9)
    expect(p.get('a')).toMatchObject({ inicio: '2026-10-09', fim: '2026-10-13' })
  })
  it('o que sobra do dia vai para o próximo da fila', () => {
    // a usa 6h/dia por 2 dias; b (9h/dia, 1 dia = 9h) pega 3h na qua, 3h na qui e 3h na sex
    const p = planejarFila([item('a', 2, 6), item('b', 1, 9)], '2026-10-07', FERIADOS, 9)
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
  it('fica na reserva de rotina e NÃO empurra o resto (Fase 0 · I)', () => {
    // antes: contínuo de 3 h/dia comia a fila; agora o ticket de 9 h ainda cabe em 1 dia de 9 h
    const p = planejarFila([item('c', 1, 3, { continuo: true }), item('a', 1, 9)], '2026-10-07', FERIADOS, 9)
    expect(p.get('c')).toMatchObject({ inicio: '2026-10-07', fim: '', horas: 0 })
    expect(p.get('a')).toMatchObject({ inicio: '2026-10-07', fim: '2026-10-07' })
  })
})

describe('fila — capacidade padrão (Fase 0 · I)', () => {
  it('6 h − 1,5 h de rotina = 4,5 h por dia para a fila', () => {
    expect(CAPACIDADE_PADRAO).toBe(4.5)
    // 9 h de trabalho a 4,5 h/dia = 2 dias (qua e qui)
    const p = planejarFila([item('a', 2, 4.5)], '2026-10-07', FERIADOS)
    expect(p.get('a')).toMatchObject({ inicio: '2026-10-07', fim: '2026-10-08', horas: 9 })
  })
})

describe('fila — ticket vira item (Minha fila, Equipe e lembrete usam a mesma regra)', () => {
  it('sem horas estimadas: usa o dia cheio da fila e marca "estimar"', async () => {
    const { itemDoTicket } = await import('../fila')
    const i = itemDoTicket({ id: 'x', numero: 1, prazo: '2026-10-20', payload: {} }, 4.5, FERIADOS)
    expect(i).toMatchObject({ horasDia: 4.5, dias: 1, continuo: false, semEstimativa: true })
  })
  it('com horas estimadas não marca "estimar"; sem prazo é contínuo', async () => {
    const { itemDoTicket } = await import('../fila')
    expect(itemDoTicket({ id: 'x', numero: 1, prazo: '2026-10-20', payload: { horas_dia: 2, dias: 3 } }, 4.5, FERIADOS))
      .toMatchObject({ horasDia: 2, dias: 3, semEstimativa: false })
    expect(itemDoTicket({ id: 'y', numero: 2, prazo: null, payload: {} }, 4.5, FERIADOS))
      .toMatchObject({ continuo: true, semEstimativa: false })
  })
  it('sexta da semana (objetivo da semana)', async () => {
    const { sextaDaSemana } = await import('../fila')
    expect(sextaDaSemana('2026-11-24')).toBe('2026-11-27') // terça → sexta
    expect(sextaDaSemana('2026-11-27')).toBe('2026-11-27') // sexta → ela mesma
    expect(sextaDaSemana('2026-11-28')).toBe('2026-12-04') // sábado → a próxima
    expect(sextaDaSemana('2026-11-29')).toBe('2026-12-04') // domingo → a próxima
  })
})

describe('fila — plano por dia (desenho da semana)', () => {
  it('diz quanto de cada item cai em cada dia', () => {
    const porDia = new Map<string, { id: string; horas: number }[]>()
    planejarFila([item('a', 1, 3), item('b', 1, 4.5)], '2026-10-07', FERIADOS, 4.5, porDia)
    expect(porDia.get('2026-10-07')).toEqual([{ id: 'a', horas: 3 }, { id: 'b', horas: 1.5 }])
    expect(porDia.get('2026-10-08')).toEqual([{ id: 'b', horas: 3 }])
  })
})
