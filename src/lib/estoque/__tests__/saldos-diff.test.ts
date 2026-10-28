import { describe, expect, it } from 'vitest'
import { agregarPosicoes, planejarSaldos, zeramentoSuspeito } from '../saldos-diff'

describe('agregarPosicoes', () => {
  it('soma o saldo dos locais e pondera o CMC pelo saldo', () => {
    const m = agregarPosicoes([
      { nCodProd: 1, nSaldo: 2, nCMC: 10 },
      { nCodProd: 1, nSaldo: 6, nCMC: 20 },
      { nCodProd: 2, nSaldo: -1, nCMC: 50 },
    ])
    expect(m.get(1)).toEqual({ saldo: 8, cmc: 17.5 })
    expect(m.get(2)).toEqual({ saldo: -1, cmc: 50 })
  })
})

describe('planejarSaldos', () => {
  const banco = [
    { codigo_produto: 1, estoque: 8, cmc: 17.5 },   // igual
    { codigo_produto: 2, estoque: 3, cmc: 10 },     // vendeu 1
    { codigo_produto: 3, estoque: 2, cmc: 40 },     // saiu da lista → zera, CMC fica
    { codigo_produto: 4, estoque: 0, cmc: 5 },      // fora da lista e já zero → nada
    { codigo_produto: 5, estoque: 1, cmc: 99.999 }, // diferença de CMC dentro da tolerância
  ]
  const lista = new Map([
    [1, { saldo: 8, cmc: 17.5 }],
    [2, { saldo: 2, cmc: 10 }],
    [5, { saldo: 1, cmc: 100 }],
    [9, { saldo: 4, cmc: 12 }], // ainda não está no banco
  ])
  it('grava só o que mudou e zera quem saiu da lista sem perder o CMC', () => {
    const p = planejarSaldos(lista, banco)
    expect(p.atualizar).toEqual([
      { codigo_produto: 2, estoque: 2, cmc: 10, valor_estoque: 20 },
      { codigo_produto: 3, estoque: 0, cmc: 40, valor_estoque: 0 },
    ])
    expect(p.zerados).toBe(1)
    expect(p.semLinha).toBe(1)
  })
  it('recusa zerar peças demais de uma vez', () => {
    const grande = Array.from({ length: 400 }, (_, i) => ({ codigo_produto: i + 1, estoque: 1, cmc: 1 }))
    const p = planejarSaldos(new Map(), grande)
    expect(zeramentoSuspeito(p, grande)).toMatch(/400 peças/)
    expect(zeramentoSuspeito(planejarSaldos(lista, banco), banco)).toBeNull()
  })
})
