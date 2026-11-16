import { describe, expect, it } from 'vitest'
import { modeloDaDescricao, nomeModelo, servem } from '../modelos'

describe('modelos', () => {
  it('nome curto do catálogo', () => {
    expect(nomeModelo('6075L')).toBe('Mahindra 6075')
    expect(nomeModelo('6075 P2')).toBe('Mahindra 6075')
    expect(nomeModelo('Jivo 2025')).toBe('Mahindra 2025')
    expect(nomeModelo('86-110')).toBe('Mahindra 86-110')
    expect(nomeModelo('WT540')).toBe('Valtra WT540')
    expect(nomeModelo('BOXER 2000 H')).toBe('BOXER 2000 H')
  })
  it('modelo citado na descrição', () => {
    expect(modeloDaDescricao('ALTERNADOR 2025', 'mahindra')).toEqual(['Mahindra 2025'])
    expect(modeloDaDescricao('FILTRO OLEO 2654407.709 MAHINDRA 86-110P', 'mahindra')).toEqual(['Mahindra 86-110'])
    expect(modeloDaDescricao('BUCHA SEXTAVADA CX. ADUBO JUMIL', 'outras')).toEqual(['Jumil'])
    expect(modeloDaDescricao('CABO COMANDO DO ACELERADOR DE MAO TL 5.80', 'outras')).toEqual(['New Holland TL 5.80'])
    expect(modeloDaDescricao('FELTRO DO ARADO MF = 660130', 'outras')).toEqual(['Massey Ferguson'])
    expect(modeloDaDescricao('ANEL ORING', 'mahindra')).toEqual([])
  })
  it('junta sem repetir', () => {
    expect(servem(['Mahindra 6075', 'Mahindra 6065'], ['Mahindra 6075'])).toEqual(['Mahindra 6075', 'Mahindra 6065'])
  })
})
