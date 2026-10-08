import { describe, it, expect } from 'vitest'
import { conflitos, proximoLivre, diasLivres, dataMinima, type Ocupacao } from '../agenda'

// 2026-10-06 é terça.
const ocup: Ocupacao[] = [
  { ini: '2026-10-06', fim: '2026-10-07', nome: 'Compra de tintas' },
  { ini: '2026-10-09', fim: '2026-10-09', nome: 'Feira' },
]

describe('agenda', () => {
  it('acha o conflito nas datas pedidas', () => {
    expect(conflitos(ocup, '2026-10-07', 2).map((o) => o.nome)).toEqual(['Compra de tintas'])
    expect(conflitos(ocup, '2026-10-08', 1)).toEqual([])
  })
  it('sugere o primeiro dia livre que comporta a duração', () => {
    expect(proximoLivre(ocup, '2026-10-06', 1)).toBe('2026-10-08')
    expect(proximoLivre(ocup, '2026-10-06', 2)).toBe('2026-10-12') // 08–09 bate na feira; pula o fim de semana
  })
  it('não começa em fim de semana', () => {
    expect(proximoLivre([], '2026-10-10', 1)).toBe('2026-10-12') // sábado → segunda
  })
  it('agenda vazia: hoje mesmo (dia útil)', () => {
    expect(proximoLivre([], '2026-10-06', 3)).toBe('2026-10-06')
  })
  it('lista vários dias livres para sugerir', () => {
    expect(diasLivres(ocup, '2026-10-06', 1, 3)).toEqual(['2026-10-08', '2026-10-12', '2026-10-13'])
  })
  it('pedido normal: no mínimo amanhã; muito urgente: hoje', () => {
    expect(dataMinima('2026-10-07', false)).toBe('2026-10-08')
    expect(dataMinima('2026-10-07', true)).toBe('2026-10-07')
  })
})
