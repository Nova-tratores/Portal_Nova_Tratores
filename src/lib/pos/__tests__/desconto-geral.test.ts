import { describe, expect, it } from 'vitest'
import { distribuirDescontoGeral, type LinhaComDesconto } from '../desconto-geral'
import { faturamentoFantasma } from '../faturamento-regras'

describe('desconto geral da OS → linhas do Omie', () => {
  const sol: LinhaComDesconto = { nQtde: 1, nValUnit: 0.000001 }
  it('OS-0803: R$ 400 entre hora (1200) e km (468), sem tocar a solicitação', () => {
    const r = distribuirDescontoGeral<LinhaComDesconto>([sol, { nQtde: 6, nValUnit: 200 }, { nQtde: 130, nValUnit: 3.6 }], 400)
    expect(r.naoAplicado).toBe(0)
    expect(r.linhas[0].nValorDesconto).toBeUndefined()
    const soma = r.linhas.reduce((t, l) => t + (l.nValorDesconto || 0), 0)
    expect(Math.round(soma * 100) / 100).toBe(400)
    expect(r.linhas[1].nValorDesconto).toBeCloseTo(287.77, 2)
    expect(r.linhas[2].nValorDesconto).toBeCloseTo(112.23, 2)
  })
  it('soma com o desconto que a linha já tinha e respeita a sobra', () => {
    const r = distribuirDescontoGeral([{ nQtde: 1, nValUnit: 100, nValorDesconto: 100 }, { nQtde: 1, nValUnit: 50 }], 20)
    expect(r.linhas[0].nValorDesconto).toBe(100)
    expect(r.linhas[1].nValorDesconto).toBe(20)
  })
  it('desconto maior que os serviços: aplica o que cabe e devolve o resto', () => {
    const r = distribuirDescontoGeral<LinhaComDesconto>([{ nQtde: 2, nValUnit: 100 }], 350)
    expect(r.linhas[0].nValorDesconto).toBe(200)
    expect(r.naoAplicado).toBe(150)
  })
  it('sem desconto não muda nada', () => {
    const l = [{ nQtde: 1, nValUnit: 10 }]
    expect(distribuirDescontoGeral(l, 0).linhas).toEqual(l)
  })
})

describe('faturada no portal, aberta no Omie (OS-0822)', () => {
  const agora = new Date('2026-10-16T20:00:00Z')
  const base = { faturadoEm: '2026-10-16T19:34:01Z', faturadoPor: 'larissa.garcia@novatratores.com.br', status: 'nfse_aguardando', nfseNumero: null }
  it('aberta no Omie depois de 10 min = fantasma', () => {
    expect(faturamentoFantasma(base, 'aberta', agora)).toBe(true)
  })
  it('não desfaz: faturada/faturando no Omie, com nota, direto no Omie ou cedo demais', () => {
    expect(faturamentoFantasma(base, 'faturada', agora)).toBe(false)
    expect(faturamentoFantasma(base, 'faturando', agora)).toBe(false)
    expect(faturamentoFantasma({ ...base, nfseNumero: '80' }, 'aberta', agora)).toBe(false)
    expect(faturamentoFantasma({ ...base, faturadoPor: 'Omie (faturada direto lá)' }, 'aberta', agora)).toBe(false)
    expect(faturamentoFantasma(base, 'aberta', new Date('2026-10-16T19:38:00Z'))).toBe(false)
  })
})
