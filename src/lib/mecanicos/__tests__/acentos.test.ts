import { describe, expect, it } from 'vitest'
import { acentuar } from '../acentos'

describe('acentuar (tempário sem acento do PDF)', () => {
  it('sistemas da lista', () => {
    expect(acentuar('Eletrico')).toBe('Elétrico')
    expect(acentuar('Hidraulico')).toBe('Hidráulico')
    expect(acentuar('Direcao')).toBe('Direção')
    expect(acentuar('Transmissao')).toBe('Transmissão')
  })
  it('serviços com ç sem til e frases', () => {
    expect(acentuar('Bomba hidraulica')).toBe('Bomba hidráulica')
    expect(acentuar('Remoçao e reinstalaçao da valvula')).toBe('Remoção e reinstalação da válvula')
    expect(acentuar('Pressao do oleo combustivel')).toBe('Pressão do óleo combustível')
    expect(acentuar('VALVULA DE ADMISSAO')).toBe('VÁLVULA DE ADMISSÃO')
  })
  it('não estraga o que já está certo nem palavras parecidas', () => {
    expect(acentuar('Hidráulico')).toBe('Hidráulico')
    expect(acentuar('Bico injetor')).toBe('Bico injetor')
    expect(acentuar('Casa da bomba')).toBe('Casa da bomba')
    expect(acentuar('Peças')).toBe('Peças')
    expect(acentuar(null)).toBe(null)
  })
})
