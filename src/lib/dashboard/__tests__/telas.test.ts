import { describe, it, expect } from 'vitest'
import { TELAS, buscarTelas, relevancia, normalizar } from '../telas'

describe('busca de telas do dashboard', () => {
  it('"etiquetas" leva à tela de Etiquetas, não ao PPV', () => {
    expect(buscarTelas(TELAS, 'etiquetas')[0].href).toBe('/ppv?tab=etiquetas')
  })
  it('ignora acento e maiúscula', () => {
    expect(buscarTelas(TELAS, 'ORCAMENTO')[0].href).toBe('/orcamentos')
    expect(buscarTelas(TELAS, 'inventario')[0].href).toBe('/ajustes/inventario')
  })
  it('nome exato vem antes de quem só contém a palavra', () => {
    const r = buscarTelas(TELAS, 'margens')
    expect(r[0].nome).toBe('Margens')
  })
  it('sinônimo encontra a tela', () => {
    expect(buscarTelas(TELAS, 'cotação').some((t) => t.href === '/requisicoes')).toBe(true)
  })
  it('busca vazia não traz nada', () => {
    expect(buscarTelas(TELAS, '   ')).toEqual([])
  })
  it('relevância: exato < começa < palavra < contém', () => {
    const q = normalizar('caixa')
    expect(relevancia('Caixa', q)).toBe(0)
    expect(relevancia('Caixas abertas', q)).toBe(1)
    expect(relevancia('Ciclo de Caixa', q)).toBe(2)
    expect(relevancia('Encaixamento', q)).toBe(3)
    expect(relevancia('Fluxo', q)).toBeNull()
  })
})
