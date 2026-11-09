import { describe, expect, it } from 'vitest'
import { montarContratos, totalDaNumeracao, type ParcelaEmprestimo } from '../contratos'

const p = (o: Partial<ParcelaEmprestimo>): ParcelaEmprestimo => ({
  conta_omie: 'NOVA', nome_fornecedor: 'BRADESCO', numero_parcela: '001/003', data_vencimento: '2026-10-10',
  valor_documento: 100, valor_pago: 0, paga: false, ...o,
})

describe('contratos de empréstimo pelas parcelas do Omie', () => {
  it('lê o total da numeração; parcela única não é contrato', () => {
    expect(totalDaNumeracao('003/024')).toBe(24)
    expect(totalDaNumeracao('001/001')).toBe(0)
    expect(totalDaNumeracao(null)).toBe(0)
  })

  it('junta pela empresa, banco e total, e soma só o que está em aberto', () => {
    const r = montarContratos([
      p({ numero_parcela: '001/003', data_vencimento: '2026-10-10', paga: true, valor_pago: 100 }),
      p({ numero_parcela: '002/003', data_vencimento: '2026-11-05' }),
      p({ numero_parcela: '003/003', data_vencimento: '2026-12-10' }),
      p({ conta_omie: 'CASTRO', numero_parcela: '001/003' }), // outra empresa: outro contrato
      p({ numero_parcela: '001/001', valor_documento: 9999 }), // avulsa: fora
    ], '2026-11-09')
    expect(r).toHaveLength(2)
    const nova = r.find((c) => c.conta === 'NOVA')!
    expect(nova).toMatchObject({ total: 3, lancadas: 3, pagas: 1, abertas: 2, vencidas: 1, faltaPagar: 200, ultima: '2026-12-10' })
    expect(nova.proxima).toEqual({ data: '2026-12-10', valor: 100 })
  })

  it('pagamento parcial conta só o que falta; quitado vai para o fim', () => {
    const r = montarContratos([
      p({ nome_fornecedor: 'ITAU', numero_parcela: '001/002', paga: true, valor_pago: 100 }),
      p({ nome_fornecedor: 'ITAU', numero_parcela: '002/002', paga: true, valor_pago: 100 }),
      p({ numero_parcela: '001/002', data_vencimento: '2026-12-01', valor_pago: 40 }),
    ], '2026-11-09')
    expect(r[0]).toMatchObject({ banco: 'BRADESCO', faltaPagar: 60 })
    expect(r[1]).toMatchObject({ banco: 'ITAU', faltaPagar: 0, abertas: 0, proxima: null })
  })
})
