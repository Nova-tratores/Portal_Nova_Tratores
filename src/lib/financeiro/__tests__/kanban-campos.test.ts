import { describe, it, expect } from 'vitest'
import { valorNumericoOuNull, datasExtrasDoCard, salvarDataParcela, opcoesQtdParcelas } from '../kanban-campos'

describe('valorNumericoOuNull', () => {
  it('campo apagado vira null, número vira número', () => {
    expect(valorNumericoOuNull('')).toBeNull()
    expect(valorNumericoOuNull('  ')).toBeNull()
    expect(valorNumericoOuNull(null)).toBeNull()
    expect(valorNumericoOuNull('1500.5')).toBe(1500.5)
    expect(valorNumericoOuNull('0')).toBe(0)
    expect(valorNumericoOuNull('abc')).toBeNull()
  })
})

describe('datasExtrasDoCard', () => {
  it('lê as datas e tira a parcela 1 repetida (registros antigos)', () => {
    expect(datasExtrasDoCard({ vencimento_boleto: '2026-01-10', datas_parcelas: '2026-01-10, 2026-02-10, 2026-03-10' }))
      .toEqual(['2026-02-10', '2026-03-10'])
    expect(datasExtrasDoCard({ datas_parcelas: '' })).toEqual([])
  })
})

describe('salvarDataParcela', () => {
  it('troca a data sem mexer nas outras', () => {
    expect(salvarDataParcela(['2026-02-10', '2026-03-10'], 0, '2026-02-15')).toEqual({ ok: true, texto: '2026-02-15, 2026-03-10' })
  })
  it('não deixa a 3ª virar 2ª: recusa preencher pulando uma', () => {
    const r = salvarDataParcela([], 1, '2026-03-10')
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('2ª parcela')
  })
  it('acrescenta a próxima em ordem', () => {
    expect(salvarDataParcela(['2026-02-10'], 1, '2026-03-10')).toEqual({ ok: true, texto: '2026-02-10, 2026-03-10' })
  })
  it('recusa apagar a do meio; apaga a última', () => {
    expect(salvarDataParcela(['a-1', 'b-2', 'c-3'], 1, '').ok).toBe(false)
    expect(salvarDataParcela(['a-1', 'b-2', 'c-3'], 2, '')).toEqual({ ok: true, texto: 'a-1, b-2' })
  })
  it('apagar campo que já estava vazio não muda nada', () => {
    expect(salvarDataParcela(['a-1'], 3, '')).toEqual({ ok: true, texto: 'a-1' })
  })
})

describe('opcoesQtdParcelas', () => {
  it('1..5 normal', () => {
    expect(opcoesQtdParcelas('3')).toEqual({ qtd: 3, opcoes: [1, 2, 3, 4, 5], foraDoPadrao: false })
    expect(opcoesQtdParcelas(null).qtd).toBe(1)
  })
  it('mais de 5 vindo do Omie aparece com o valor real', () => {
    expect(opcoesQtdParcelas(8)).toEqual({ qtd: 8, opcoes: [1, 2, 3, 4, 5, 8], foraDoPadrao: true })
  })
})
