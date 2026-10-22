import { describe, expect, it } from 'vitest'
import { carreiraDe, caminho, contarOSLimpas, nivelDoSaldo, patente, pesoOcorrencia } from '../carreira'
import { calcularComissoes, comissaoFixa, previsaoPagamento, projetarMes } from '../comissao'

describe('carreira do mecânico (pontos por OS limpa)', () => {
  it('nomes das patentes', () => {
    expect(patente(0).nome).toBe('Ferro 5')
    expect(patente(4).nome).toBe('Ferro 1')
    expect(patente(5).nome).toBe('Bronze 5')
    expect(patente(19).nome).toBe('Ouro 1')
    expect(patente(20).nome).toBe('Diamante')
    expect(patente(99).nome).toBe('Diamante')
  })
  it('100 pontos = 1 degrau; retorno pesa o dobro', () => {
    expect(nivelDoSaldo(0)).toBe(0)
    expect(nivelDoSaldo(99)).toBe(0)
    expect(nivelDoSaldo(100)).toBe(1)
    expect(nivelDoSaldo(-50)).toBe(0)
    expect(nivelDoSaldo(99999)).toBe(20)
    expect(pesoOcorrencia({ pontos: 8, vale: true, subcategoria: 'retorno_servico' })).toBe(16)
    expect(pesoOcorrencia({ pontos: 8, vale: false, subcategoria: 'retorno_servico' })).toBe(0)
  })
  it('cada OS limpa dá 5 pontos, ocorrência desconta, saldo nunca negativo', () => {
    const c = caminho('2026-01', '2026-04', { '2026-01': { pontos: 0, qtd: 0, osLimpas: 10 }, '2026-02': { pontos: 80, qtd: 3, osLimpas: 2 }, '2026-03': { pontos: 0, qtd: 0, osLimpas: 30 } })
    expect(c.meses.map((m) => m.saldo)).toEqual([50, 0, 150])
    expect(c.meses.map((m) => m.depois)).toEqual([0, 0, 1])
    expect(c.nivel).toBe(1)
  })
  it('mês atual entra no "se fechar assim" e mostra quanto falta', () => {
    const r = carreiraDe('Ana', '2026-01', '2026-03', { '2026-01': { pontos: 0, qtd: 0, osLimpas: 18 }, '2026-02': { pontos: 6, qtd: 1, osLimpas: 6 }, '2026-03': { pontos: 0, qtd: 0, osLimpas: 4 } })
    expect(r.saldo).toBe(114)
    expect(r.nivel).toBe(1)
    expect(r.saldoAgora).toBe(134)
    expect(r.seFecharAssim).toBe(1)
    expect(r.faltaProximo).toBe(66)
    expect(r.mesAtual).toEqual({ pontos: 0, qtd: 0, osLimpas: 4, ganhos: 20 })
    expect(r.osLimpasTotal).toBe(28)
    expect(r.sequencia).toBe(0)
  })
  it('OS com ocorrência ou pendência não conta; portal e Omie casam; OS repetida conta 1', () => {
    const r = contarOSLimpas([
      { os: 'OS-0793', numeroOmie: '5345', data: '2026-10-02', tecnicos: ['Ana', 'Bia'] },
      { os: 'OS-0800', numeroOmie: '005350', data: '2026-10-03', tecnicos: ['Ana'] },
      { os: 'OS-0801', numeroOmie: null, data: '2026-09-30', tecnicos: ['Ana'] },
      { os: 'OS-0793', numeroOmie: '5345', data: '2026-10-02', tecnicos: ['Ana'] },
    ], new Set(['5350']))
    expect(r).toEqual({ Ana: { '2026-10': 1, '2026-09': 1 }, Bia: { '2026-10': 1 } })
  })
})

describe('previsão de comissão (regra do painel Omie)', () => {
  it('valor fixo por contrato', () => {
    expect(comissaoFixa('Entrega Tecnica')).toBe(150)
    expect(comissaoFixa('Montagem Carreta')).toBe(250)
    expect(comissaoFixa('Montagem Desligament')).toBe(400)
    expect(comissaoFixa('Montagem Grade')).toBe(500)
    expect(comissaoFixa('Montagem Quadriciclo')).toBe(150)
    expect(comissaoFixa('Cortesia Oficina')).toBeNull()
  })
  it('% sobre as horas dividido entre técnicos + fixa + aguardando', () => {
    const os = { os: 'OS-1', numeroOmie: '1', cliente: '', data: '2026-09-10', em: null, tecnicos: ['Ana', 'Bia'], horasCobradas: 4, km: 0, servico: 1000, kmValor: 200, pecas: 0, outros: 0, bruto: 1200, custo: 0 }
    const int = { os: 'OS-2', numeroOmie: '2', cliente: '', contrato: 'Entrega Tecnica', motivo: '', data: '2026-09-12', valor: 300, horas: 2, tecnicos: ['Ana'] }
    const pend = { os: 'OS-3', tipo: 'preenchida' as const, status: '', cliente: '', tecnicos: ['Ana'], dataRef: null, dias: 1, maoDeObra: 400, deslocamento: 0, pecas: 0, total: 400, garantia: false }
    const r = calcularComissoes('2026-09-01', '2026-09-30', { Ana: 30, Bia: 20 }, [os], [int], [pend])
    expect(r.Ana).toMatchObject({ faturadas: 150, internas: 150, total: 300, aguardando: 120 })
    expect(r.Bia.total).toBe(100)
  })
  it('projeção e pagamento', () => {
    expect(projetarMes(100, '2026-09', '2026-09-30')).toBe(100)
    expect(projetarMes(100, '2026-10', '2026-10-09')).toBeGreaterThan(100)
    expect(previsaoPagamento('2026-12')).toBe('2027-01-20')
  })
})
