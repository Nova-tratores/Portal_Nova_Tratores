import { describe, it, expect } from 'vitest'
import { chaveNomeCompleto, ehVendedor, ehComissaoDeVenda } from '../vendedor-tecnico'

describe('vendedor não vira técnico', () => {
  const vend = new Set(['DOUGRAS MOGRS JESUS BOMFIM', 'LUIZ FERNANDO SANCHES'].map(chaveNomeCompleto))
  it('nome do Omie com "de" casa com a régua', () => {
    expect(ehVendedor('Dougras Mogrs de Jesus Bomfim', vend)).toBe(true)
    expect(ehVendedor('DOUGRAS MOGRS DE JESUS BOMFIM', vend)).toBe(true)
  })
  it('nome parcial de técnico não é vendedor', () => {
    expect(ehVendedor('Luiz Fernando', vend)).toBe(false)
    expect(ehVendedor('Gabriel Moraes', vend)).toBe(false)
  })
  it('comissão no texto do item', () => {
    expect(ehComissaoDeVenda('COMISSAO VENDA DIRETA GTM')).toBe(true)
    expect(ehComissaoDeVenda('COMISSÃO DOUGRAS')).toBe(true)
    expect(ehComissaoDeVenda('Revisão 500 horas trator 6075')).toBe(false)
  })
})
