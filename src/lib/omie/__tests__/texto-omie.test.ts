import { describe, expect, it } from 'vitest'
import { semCaracteresDoOmie, textoNormal } from '../conferencia'

describe('texto que o Omie guarda', () => {
  it('tira o que o Omie descarta e mantém acentos', () => {
    expect(semCaracteresDoOmie('Horimetro: 918•8')).toBe('Horimetro: 918,8')
    expect(semCaracteresDoOmie('Revisão “900h” 🚜 ção')).toBe('Revisão 900h  ção')
  })
  it('conferência não acusa diferença por causa da bolinha (OS-0807)', () => {
    expect(textoNormal('Horimetro: 918•8\n\nSolicitação')).toBe(textoNormal('Horimetro: 918,8 Solicitação'))
  })
})
