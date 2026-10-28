import { describe, expect, it } from 'vitest'
import { descricaoOmie, statusOmieErro } from '../omie-status'

describe('resposta do faturamento de pedido no Omie', () => {
  it('cCodStatus diferente de 0 é recusa (PPV-0505, 22/10/2026)', () => {
    const r = { cCodStatus: '1', cDescStatus: 'Foram encontrados erros durante a validação dessa Pedido de Venda de Produto! O CFOP  do produto (RA-1900039331410) "ANEL TRAVA" não está preenchido.' }
    expect(statusOmieErro(r)).toBe(true)
    expect(descricaoOmie(r)).toMatch(/^O CFOP/)
  })
  it('0 ou sem código = ok', () => {
    expect(statusOmieErro({ cCodStatus: '0', cDescStatus: 'Pedido faturado' })).toBe(false)
    expect(statusOmieErro({})).toBe(false)
    expect(statusOmieErro(null)).toBe(false)
  })
})
