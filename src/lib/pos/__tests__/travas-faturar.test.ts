import { describe, expect, it } from 'vitest'
import { avaliarTravas, bloqueioTravas } from '../travas-faturar'

const base = { hoje: '2026-10-22', previsaoFaturamento: '2026-10-22', projeto: '6075E CAB MDI07520CT0006572', documentoCliente: '08.351.690/0003-05', localizacaoConfirmada: true }

describe('travas antes de faturar a OS', () => {
  it('tudo certo = pode faturar', () => {
    expect(bloqueioTravas(avaliarTravas(base))).toBeNull()
  })
  it('previsão tem que ser hoje', () => {
    const t = avaliarTravas({ ...base, previsaoFaturamento: '2026-10-21' })
    expect(t.find((x) => x.chave === 'previsao')).toMatchObject({ ok: false })
    expect(t.find((x) => x.chave === 'previsao')!.detalhe).toMatch(/21\/10\/2026.*22\/10\/2026/)
    expect(avaliarTravas({ ...base, previsaoFaturamento: null }).find((x) => x.chave === 'previsao')!.detalhe).toMatch(/vazia/)
    expect(avaliarTravas({ ...base, previsaoFaturamento: '2026-10-22T00:00:00' }).find((x) => x.chave === 'previsao')!.ok).toBe(true)
  })
  it('projeto obrigatório e localização confirmada', () => {
    const t = avaliarTravas({ ...base, projeto: '  ', localizacaoConfirmada: false })
    expect(t.filter((x) => !x.ok).map((x) => x.chave)).toEqual(['projeto', 'localizacao'])
    expect(bloqueioTravas(t)).toMatch(/projeto.*localização/)
  })
  it('cliente sem documento não trava pela localização', () => {
    expect(avaliarTravas({ ...base, documentoCliente: '', localizacaoConfirmada: false }).find((x) => x.chave === 'localizacao')!.ok).toBe(true)
  })
})
