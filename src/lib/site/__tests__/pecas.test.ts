import { describe, expect, it } from 'vitest'
import { buscarPecas, grupoDaPeca, limparNome, marcaCurta, montarPecas } from '../pecas'

const p = (codigo: string, descricao: string, marca: string | null = '', imagem_url: string | null = null) => ({ codigo, descricao, marca, imagem_url })

describe('grupoDaPeca', () => {
  it('reconhece Mahindra por marca, descrição e código', () => {
    expect(grupoDaPeca(p('X1', 'FILTRO', 'MAHINDRA DO BRASIL INDUSTRIAL LTDA'))).toBe('mahindra')
    expect(grupoDaPeca(p('51095/PF', 'DISCO MAHINDRA 12"'))).toBe('mahindra')
    expect(grupoDaPeca(p('RP-006514798U1', 'BUCHA EIXO FRONTAL'))).toBe('mahindra')
    expect(grupoDaPeca(p('005555955R1', 'ARRUELA PLANA'))).toBe('mahindra')
    expect(grupoDaPeca(p('Y8401980', 'EIXO PINHAO KUHN', 'KUHN'))).toBe('outras')
  })
})

describe('limpeza', () => {
  it('desfaz entidades e marca curta', () => {
    expect(limparNome('DISCO MAHINDRA 12&quot;')).toBe('DISCO MAHINDRA 12"')
    expect(marcaCurta('N/D')).toBe('')
    expect(marcaCurta('KUHN')).toBe('Kuhn')
    expect(marcaCurta('BRUTER BRASIL SOLUCOES PARA AGRICULTURA LTDA')).toBe('Bruter Brasil')
  })
})

describe('montarPecas e buscarPecas', () => {
  const pecas = montarPecas([
    p('RP-007205821C1', 'MOLA DE TORCAO FREIO RP-007205821C1'),
    p('RP-007205821C1', 'MOLA DE TORCAO FREIO', '', 'https://foto'),
    p('B2022060', 'FILTRO DE AR EXTERNO B2022060', 'KUHN'),
  ])
  it('não repete código e guarda a foto de qualquer empresa', () => {
    expect(pecas).toHaveLength(2)
    expect(pecas.find((x) => x.codigo === 'RP-007205821C1')?.foto).toBe('https://foto')
  })
  it('acha por palavra, por código sem pontuação e filtra o grupo', () => {
    expect(buscarPecas(pecas, 'mola freio').map((x) => x.codigo)).toEqual(['RP-007205821C1'])
    expect(buscarPecas(pecas, 'rp007205821').length).toBe(1)
    expect(buscarPecas(pecas, 'filtro', 'mahindra')).toEqual([])
    expect(buscarPecas(pecas, '', 'outras').map((x) => x.codigo)).toEqual(['B2022060'])
  })
})
