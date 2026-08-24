import { describe, expect, it } from 'vitest'
import { corDaCategoria, corDoSlot, mapaDeCores } from '../paleta'

describe('paleta categórica', () => {
  it('mesma categoria, mesma cor — sempre', () => {
    const a = mapaDeCores(['Combustível', 'Multas', 'Veículos'])
    const b = mapaDeCores(['Veículos', 'Combustível', 'Multas']) // outra ordem de entrada
    expect(a.get('COMBUSTÍVEL')).toBe(b.get('COMBUSTÍVEL'))
    expect(corDaCategoria('combustível', 'claro', a)).toBe(corDaCategoria('COMBUSTÍVEL ', 'claro', b))
  })

  it('categorias distintas não dividem slot enquanto houver slot livre', () => {
    const nomes = ['Combustível', 'Multas', 'Veículos', 'Peças', 'Frete', 'Energia']
    const mapa = mapaDeCores(nomes)
    const slots = nomes.map((n) => mapa.get(n.toUpperCase()))
    expect(new Set(slots).size).toBe(nomes.length)
  })

  it('claro e escuro são paletas diferentes, não a mesma cor clareada', () => {
    expect(corDoSlot(0, 'claro')).not.toBe(corDoSlot(0, 'escuro'))
  })

  it('slot fora da faixa não quebra', () => {
    expect(corDoSlot(99, 'claro')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(corDoSlot(-3, 'escuro')).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
