import { describe, expect, it } from 'vitest'
import { agruparPorDestino, andar, dentro, destinoRejeicao, diaBR, ehAtual, janela, trocarEscala, valorNoDestino } from '../garantias-painel'

describe('janelas Dia · Mês · Ano', () => {
  it('mês vai do dia 1 ao 1 do mês seguinte', () => {
    const j = janela('mes', '2026-10-22')
    expect([j.de, j.ate, j.rotulo]).toEqual(['2026-10-01', '2026-11-01', 'outubro de 2026'])
    expect(janela('mes', '2026-12-05').ate).toBe('2027-01-01')
  })
  it('dia e ano', () => {
    expect(janela('dia', '2026-10-22')).toMatchObject({ de: '2026-10-22', ate: '2026-10-23', rotulo: 'quinta, 22/10/2026' })
    expect(janela('ano', '2026-10-22')).toMatchObject({ de: '2026-01-01', ate: '2027-01-01', rotulo: '2026' })
  })
  it('setas atravessam mês e ano', () => {
    expect(andar(janela('mes', '2026-01-10'), -1).de).toBe('2025-12-01')
    expect(andar(janela('mes', '2026-12-10'), 1).de).toBe('2027-01-01')
    expect(andar(janela('dia', '2026-03-01'), -1).de).toBe('2026-02-28')
    expect(andar(janela('ano', '2026-05-01'), -2).de).toBe('2024-01-01')
  })
  it('trocar a escala fica no dia de hoje quando ele está na janela; senão no começo dela', () => {
    expect(trocarEscala(janela('mes', '2026-10-01'), 'dia', '2026-10-22').de).toBe('2026-10-22')
    expect(trocarEscala(janela('mes', '2026-08-01'), 'dia', '2026-10-22').de).toBe('2026-08-01')
    expect(ehAtual(janela('ano', '2026-01-01'), '2026-10-22')).toBe(true)
  })
  it('data de fechamento conta no dia de Brasília', () => {
    expect(diaBR('2026-11-01T02:30:00+00:00')).toBe('2026-10-31') // 23:30 de 31/10 em Brasília
    expect(diaBR('2026-10-20T16:47:13.158+00:00')).toBe('2026-10-20')
    expect(diaBR(null)).toBeNull()
    expect(dentro(diaBR('2026-11-01T02:30:00Z'), janela('mes', '2026-10-01'))).toBe(true)
  })
})

describe('destino das rejeitadas', () => {
  const g = (id: string, status: string, valor: number, esperado = 1000, pago = 0) => ({ id, esperado, pago, cobranca: { status, valor } })
  it('mapeia o cobranca_status', () => {
    expect(destinoRejeicao('paga')).toBe('pago')
    expect(destinoRejeicao('cobrada')).toBe('a_receber')
    expect(destinoRejeicao('nao_cobrar')).toBe('despesa')
    expect(destinoRejeicao('baixada_prejuizo')).toBe('despesa')
    expect(destinoRejeicao('pendente')).toBe('sem_definicao')
    expect(destinoRejeicao(null)).toBe('sem_definicao')
  })
  it('valor no destino', () => {
    expect(valorNoDestino(g('a', 'paga', 600))).toBe(600)
    expect(valorNoDestino(g('b', 'cobrada', 0))).toBe(1000) // cobrança sem valor = o negado
    expect(valorNoDestino(g('c', 'nao_cobrar', 0, 1000, 200))).toBe(800)
    expect(valorNoDestino(g('d', 'baixada_prejuizo', 450))).toBe(450)
  })
  it('agrupa nas 4 fatias, na ordem, com o que ficou fora da cobrança', () => {
    const r = agruparPorDestino([g('a', 'paga', 600), g('b', 'cobrada', 300), g('c', 'nao_cobrar', 0), g('d', 'pendente', 0), g('e', 'nao_cobrar', 0, 500)])
    expect(r.fatias.map((f) => [f.k, f.n, f.valor])).toEqual([['pago', 1, 600], ['a_receber', 1, 300], ['despesa', 2, 1500], ['sem_definicao', 1, 1000]])
    expect(r.n).toBe(5)
    expect(r.total).toBe(3400)
    expect(r.naoCobrado).toBe(1100) // 400 + 700
    expect(r.fatias[2].itens.map((x) => x.id)).toEqual(['c', 'e'])
  })
  it('lista vazia', () => {
    const r = agruparPorDestino([])
    expect(r.fatias).toHaveLength(4)
    expect(r.total).toBe(0)
  })
})
