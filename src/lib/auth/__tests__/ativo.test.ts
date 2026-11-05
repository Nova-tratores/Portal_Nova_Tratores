import { describe, it, expect } from 'vitest'
import { linhaDesativada } from '../ativo'

describe('linhaDesativada', () => {
  it('só bloqueia quem foi desativado de fato', () => {
    expect(linhaDesativada({ ativo: false })).toBe(true)
    expect(linhaDesativada({ ativo: true })).toBe(false)
  })
  it('sem cadastro no portal (app dos mecânicos/vendas) ou coluna vazia passa', () => {
    expect(linhaDesativada(null)).toBe(false)
    expect(linhaDesativada(undefined)).toBe(false)
    expect(linhaDesativada({ ativo: null })).toBe(false)
    expect(linhaDesativada({})).toBe(false)
  })
})
