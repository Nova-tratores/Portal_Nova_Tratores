import { describe, expect, it } from 'vitest'
import { carreiraDe, caminho, movimentoDoMes, patente, pesoOcorrencia } from '../carreira'
import { calcularComissoes, comissaoFixa, previsaoPagamento, projetarMes } from '../comissao'

describe('carreira do mecânico', () => {
  it('nomes das patentes', () => {
    expect(patente(0).nome).toBe('Ferro 5')
    expect(patente(4).nome).toBe('Ferro 1')
    expect(patente(5).nome).toBe('Bronze 5')
    expect(patente(19).nome).toBe('Ouro 1')
    expect(patente(20).nome).toBe('Diamante')
    expect(patente(99).nome).toBe('Diamante')
  })
  it('mês limpo sobe 1; ocorrência derruba 1 a cada 10 pontos; retorno pesa o dobro', () => {
    expect(movimentoDoMes(0)).toBe(1)
    expect(movimentoDoMes(3)).toBe(-1)
    expect(movimentoDoMes(16)).toBe(-2)
    expect(pesoOcorrencia({ pontos: 8, vale: true, subcategoria: 'retorno_servico' })).toBe(16)
    expect(pesoOcorrencia({ pontos: 8, vale: false, subcategoria: 'retorno_servico' })).toBe(0)
  })
  it('caminho não passa de Diamante nem cai abaixo de Ferro 5', () => {
    const c = caminho('2026-01', '2026-05', { '2026-02': { pontos: 30, qtd: 2 } })
    expect(c.meses.map((m) => m.depois)).toEqual([1, 0, 1, 2])
    expect(c.nivel).toBe(2)
  })
  it('mês atual mostra o que acontece se fechar assim, e a sequência limpa', () => {
    const r = carreiraDe('Ana', '2026-01', '2026-04', { '2026-04': { pontos: 4, qtd: 1 } })
    expect(r.nivel).toBe(3)
    expect(r.seFecharAssim).toBe(2)
    expect(r.sequencia).toBe(3)
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
