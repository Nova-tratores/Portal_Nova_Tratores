import { describe, it, expect } from 'vitest'
import { classificarPendencia, ultimoDiaExecucao, resumoPendencias, type Pendencia } from '../pendencias'

const ctx = { faturada: false, interna: false, temRelatorio: false, hoje: '2026-10-16' }

describe('pendências de faturamento', () => {
  it('último dia de execução', () => {
    expect(ultimoDiaExecucao({ Dias_Execucao: '2026-10-02, 2026-10-01' })).toBe('2026-10-02')
    expect(ultimoDiaExecucao({ Dias_Execucao: '', Previsao_Execucao: '2026-10-05' })).toBe('2026-10-05')
    expect(ultimoDiaExecucao({})).toBeNull()
  })

  it('preenchida: relatório feito ou fase depois da execução, sem faturar', () => {
    expect(classificarPendencia({ Status: 'Execução' }, { ...ctx, temRelatorio: true })).toBe('preenchida')
    expect(classificarPendencia({ Status: 'Enviar Omie' }, ctx)).toBe('preenchida')
    expect(classificarPendencia({ Status: 'Concluída' }, { ...ctx, faturada: true })).toBeNull()
    expect(classificarPendencia({ Status: 'Concluída' }, { ...ctx, interna: true })).toBeNull()
    expect(classificarPendencia({ Status: 'Cancelada' }, { ...ctx, temRelatorio: true })).toBeNull()
  })

  it('atrasada: passou da data sem relatório', () => {
    expect(classificarPendencia({ Status: 'Execução', Previsao_Execucao: '2026-10-10' }, ctx)).toBe('atrasada')
    expect(classificarPendencia({ Status: 'Execução', Previsao_Execucao: '2026-10-16' }, ctx)).toBeNull() // hoje ainda não passou
    expect(classificarPendencia({ Status: 'Orçamento', Previsao_Execucao: '2026-10-01' }, ctx)).toBeNull() // orçamento não conta
  })

  it('resumo por tipo, idade e técnico', () => {
    const p = (os: string, tipo: 'preenchida' | 'atrasada', dias: number, total: number, tecnicos: string[]): Pendencia =>
      ({ os, tipo, status: '', cliente: '', tecnicos, dataRef: null, dias, maoDeObra: 0, deslocamento: 0, pecas: 0, total, garantia: false })
    const r = resumoPendencias([p('1', 'preenchida', 3, 1000, ['Ana']), p('2', 'preenchida', 40, 500, ['Ana', 'Bia']), p('3', 'atrasada', 10, 300, [])])
    expect(r.preenchida).toMatchObject({ qtd: 2, total: 1500 })
    expect(r.preenchida.idade[0]).toMatchObject({ qtd: 1, total: 1000 })
    expect(r.preenchida.idade[3]).toMatchObject({ qtd: 1, total: 500 })
    expect(r.porTecnico.Ana).toEqual({ qtd: 2, total: 1250 })
    expect(r.porTecnico['Sem técnico']).toEqual({ qtd: 1, total: 300 })
  })
})
