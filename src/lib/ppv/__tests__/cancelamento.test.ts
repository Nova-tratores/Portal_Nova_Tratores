import { describe, it, expect } from 'vitest'
import { bloqueioCancelamento, falhaNaResposta, cancelarPeloSalvar } from '../cancelamento'

describe('cancelamento do PPV', () => {
  it('não cancela pedido faturado', () => {
    expect(bloqueioCancelamento({ faturadoEm: '2026-10-30T12:00:00Z' })).toMatch(/NF-e/)
    expect(bloqueioCancelamento({ etapaOmie: '60' })).toMatch(/faturado/)
    expect(bloqueioCancelamento({ etapaOmie: '70' })).toMatch(/faturado/)
    expect(bloqueioCancelamento({ etapaOmie: '20' })).toBeNull()
    expect(bloqueioCancelamento({})).toBeNull()
  })
  it('lê a recusa no corpo da resposta da Omie', () => {
    expect(falhaNaResposta({ cCodStatus: '0', cDescStatus: 'Pedido cancelado' })).toBeNull()
    expect(falhaNaResposta({})).toBeNull()
    expect(falhaNaResposta({ cCodStatus: '1', cDescStatus: 'Pedido já faturado' })).toBe('Pedido já faturado')
    expect(falhaNaResposta({ cCodStatus: 5 })).toBe('código 5')
  })
  it('salvar a ficha não cancela pedido que está no Omie', () => {
    expect(cancelarPeloSalvar({ statusAntes: 'Aguardando', statusNovo: 'Cancelada', pedidoOmie: '1234' })).toMatch(/Cancelar pedido/)
    expect(cancelarPeloSalvar({ statusAntes: 'Aguardando', statusNovo: 'Cancelada', pedidoOmie: '' })).toBeNull()
    expect(cancelarPeloSalvar({ statusAntes: 'Cancelada', statusNovo: 'Cancelada', pedidoOmie: '1234' })).toBeNull()
    expect(cancelarPeloSalvar({ statusAntes: 'Aguardando', statusNovo: 'Concluída', pedidoOmie: '1234' })).toBeNull()
  })
})
