import { describe, expect, it } from 'vitest'
import { chaveMM, textoMarcaModelo, valorUtil } from '../etiquetas-marca-modelo'

describe('marca e modelo na etiqueta', () => {
  it('ignora vazio, N/D e zeros', () => {
    expect(valorUtil('')).toBe('')
    expect(valorUtil(null)).toBe('')
    expect(valorUtil('N/D')).toBe('')
    expect(valorUtil('#N/D')).toBe('')
    expect(valorUtil('000')).toBe('')
    expect(valorUtil(' KUHN ')).toBe('KUHN')
  })

  it('monta só o que foi pedido e existe', () => {
    const mm = { marca: 'KUHN', modelo: '6075E' }
    expect(textoMarcaModelo(mm, { marca: true, modelo: true })).toBe('MARCA KUHN · MODELO 6075E')
    expect(textoMarcaModelo(mm, { marca: false, modelo: true })).toBe('MODELO 6075E')
    expect(textoMarcaModelo({ marca: 'KUHN', modelo: 'N/D' }, { marca: true, modelo: true })).toBe('MARCA KUHN')
    expect(textoMarcaModelo(undefined, { marca: true, modelo: true })).toBe('')
  })

  it('chave normaliza a conta', () => {
    expect(chaveMM('nova', ' 123 ')).toBe('NOVA|123')
  })
})
