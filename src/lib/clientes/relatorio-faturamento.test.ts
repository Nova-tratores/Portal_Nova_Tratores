import { describe, it, expect } from 'vitest'
import {
  periodoDaSemana, segundaDaSemana, datasBR, nomeTecnico, chaveTecnico, kmCobradoDosServicos,
  montarRelatorio, TECNICO_BALCAO, type OSFaturada, type PVFaturado,
} from './relatorio-faturamento'

describe('período', () => {
  it('segunda até sexta da semana da data', () => {
    expect(segundaDaSemana('2026-10-09')).toBe('2026-10-05') // sexta
    expect(segundaDaSemana('2026-10-11')).toBe('2026-10-05') // domingo
    expect(periodoDaSemana('2026-10-09', 5)).toEqual({ inicio: '2026-10-05', fim: '2026-10-09' })
  })
  it('dia de envio configurável e nunca passa de hoje', () => {
    expect(periodoDaSemana('2026-10-08', 4)).toEqual({ inicio: '2026-10-05', fim: '2026-10-08' })
    expect(periodoDaSemana('2026-10-07', 5, '2026-10-07')).toEqual({ inicio: '2026-10-05', fim: '2026-10-07' })
  })
  it('datas no formato do vendas_itens', () => {
    expect(datasBR('2026-09-30', '2026-10-02')).toEqual(['30/09/2026', '01/10/2026', '02/10/2026'])
  })
})

describe('técnico', () => {
  it('limpa prefixo, segundo técnico e caixa', () => {
    expect(nomeTecnico('Técnico: FERNANDO LEONEL')).toBe('Fernando Leonel')
    expect(nomeTecnico('GABRIEL MORAES // DANILO DE SOUZA')).toBe('Gabriel Moraes')
    expect(nomeTecnico('danilo de souza')).toBe('Danilo de Souza')
    expect(chaveTecnico('José  Camargo')).toBe(chaveTecnico('jose camargo'))
  })
})

describe('km cobrado', () => {
  it('soma as linhas de KM Deslocamento', () => {
    const servs = [
      { cod: 2209673817, qtd: 1, valor: 0.000001, desc: 'Modelo: X|Chassis: 1' },
      { cod: 1979758762, qtd: 6, valor: 200, desc: 'Hora Trabalhada' },
      { cod: 1975974257, qtd: 130, valor: 3.6, desc: 'Deslocamento por KM' },
    ]
    expect(kmCobradoDosServicos(JSON.stringify(servs))).toBe(130)
  })
  it('sem linha de km → null', () => {
    expect(kmCobradoDosServicos([{ cod: 1, qtd: 2, desc: 'Hora Trabalhada' }])).toBeNull()
  })
})

describe('montarRelatorio', () => {
  const os = (p: Partial<OSFaturada>): OSFaturada => ({
    empresa: 'Nova Tratores', num_os: '1', cod_os: 1, data_faturamento: '2026-10-06', cliente: 'C', valor: 100,
    tecnico: 'Fernando Leonel', tecnico2: null, km_relatorio: 50, km_cobrado: 60, km_origem: 'relatorio', tem_relatorio: true, pos_id: null, ...p,
  })
  const pv = (p: Partial<PVFaturado>): PVFaturado => ({
    empresa: 'Nova Tratores', num_pedido: '9', data_faturamento: '2026-10-07', cliente: 'C', valor_pecas: 300, itens: 2,
    tecnico: '', origem_tecnico: 'balcao', num_os: null, ...p,
  })
  it('agrupa por técnico (grafias juntas), Balcão por último', () => {
    const r = montarRelatorio('2026-10-05', '2026-10-09',
      [os({ num_os: '1' }), os({ num_os: '2', tecnico: 'FERNANDO LEONEL', valor: 50, km_relatorio: 10, km_cobrado: null })],
      [pv({}), pv({ num_pedido: '8', tecnico: 'Fernando Leonel', origem_tecnico: 'ppv', valor_pecas: 20 })])
    expect(r.por_tecnico.map(l => l.tecnico)).toEqual(['Fernando Leonel', TECNICO_BALCAO])
    expect(r.por_tecnico[0]).toMatchObject({ os: 2, valor_servico: 150, km_relatorio: 60, km_cobrado: 60, pv: 1, valor_pecas: 20, total: 170 })
    expect(r.totais).toMatchObject({ os: 2, pv: 2, valor_servico: 150, valor_pecas: 320, total: 470 })
  })
})
