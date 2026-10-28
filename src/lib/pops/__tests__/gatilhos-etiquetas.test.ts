import { describe, expect, it } from 'vitest'
import { chassiDoProjeto, gatilhoCasaComOS, normalizarEtiquetas, refExecucaoDaOS, validarGatilhoOS } from '../regras'

describe('etiquetas', () => {
  it('normaliza: minúsculas, sem #, sem repetir, aceita texto com vírgulas', () => {
    expect(normalizarEtiquetas(['Limpeza', ' #Segurança ', 'limpeza', ''])).toEqual(['limpeza', 'segurança'])
    expect(normalizarEtiquetas('oficina,  caixa   d\'água ')).toEqual(['oficina', "caixa d'água"])
    expect(normalizarEtiquetas(null)).toEqual([])
  })
  it('limita a 10 e a 30 caracteres', () => {
    expect(normalizarEtiquetas(Array.from({ length: 15 }, (_, i) => `e${i}`))).toHaveLength(10)
    expect(normalizarEtiquetas(['x'.repeat(50)])[0]).toHaveLength(30)
  })
})

describe('execução pela OS', () => {
  const g = { tipo_servico: 'Revisão', fase: 'Execução', ativo: true }
  it('casa tipo e fase sem acento/caixa', () => {
    expect(gatilhoCasaComOS(g, { Tipo_Servico: 'REVISAO', Status: 'execução' })).toBe(true)
    expect(gatilhoCasaComOS(g, { Tipo_Servico: 'Manutenção', Status: 'Execução' })).toBe(false)
    expect(gatilhoCasaComOS(g, { Tipo_Servico: 'Revisão', Status: 'Execução aguardando peças (em transporte)' })).toBe(false)
    expect(gatilhoCasaComOS({ ...g, ativo: false }, { Tipo_Servico: 'Revisão', Status: 'Execução' })).toBe(false)
  })
  it('acha o chassi no Projeto', () => {
    expect(chassiDoProjeto('MAHINDRA 7095 MDI09520PT0006593')).toBe('MDI09520PT0006593')
    expect(chassiDoProjeto('86110 NP7T4KC6EPMA05338')).toBe('NP7T4KC6EPMA05338')
    expect(chassiDoProjeto('6075E CAB')).toBeNull()
    expect(chassiDoProjeto(null)).toBeNull()
  })
  it('monta a referência', () => {
    expect(refExecucaoDaOS('OS-0852', 'MAHINDRA 7095 MDI09520PT0006593')).toBe('OS-0852 · MDI09520PT0006593')
    expect(refExecucaoDaOS('OS-0852', '')).toBe('OS-0852')
  })
  it('valida a regra', () => {
    const r = '44444444-4444-4444-4444-444444444444'
    expect('erro' in validarGatilhoOS({ fase: 'Execução', responsavel_padrao_id: r })).toBe(true)
    expect('erro' in validarGatilhoOS({ tipo_servico: 'Revisão', fase: 'Execução' })).toBe(true)
    expect(validarGatilhoOS({ tipo_servico: ' Revisão ', fase: 'Execução', responsavel_padrao_id: r }))
      .toEqual({ dados: { tipo_servico: 'Revisão', fase: 'Execução', responsavel_padrao_id: r } })
  })
})
