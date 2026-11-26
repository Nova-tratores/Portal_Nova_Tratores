import { describe, it, expect } from 'vitest'
import { ehContaTeste } from '@/lib/texto'

// 24/11/2026: o \b da regra virou um caractere invisível ao gravar e o filtro
// passou a não pegar nada, sem ninguém perceber. Este teste segura isso.
describe('ehContaTeste', () => {
  it('sem a coluna teste: "teste" como palavra no nome ou na função', () => {
    expect(ehContaTeste({ nome: 'Mecânico Teste' })).toBe(true)
    expect(ehContaTeste({ nome: 'Teste Mobile (Claude)' })).toBe(true)
    expect(ehContaTeste({ nome: 'VENDEDOR TESTE 2' })).toBe(true)
    expect(ehContaTeste({ nome: 'Fulano', funcao: 'Teste' })).toBe(true)
  })

  it('sem a coluna: não pega nome normal nem palavra que só contém "teste"', () => {
    expect(ehContaTeste({ nome: 'Reserva Ortiz' })).toBe(false)
    expect(ehContaTeste({ nome: 'José Ortiz', funcao: 'T.I.' })).toBe(false)
    expect(ehContaTeste({ nome: 'Testemunha Silva' })).toBe(false)
  })

  it('com a coluna: ela decide, o nome não importa', () => {
    expect(ehContaTeste({ nome: 'Mecânico Teste', teste: false })).toBe(false)
    expect(ehContaTeste({ nome: 'Reserva Ortiz', teste: true })).toBe(true)
  })
})
