// Partes puras do PDF de Vendas por Modelo (rótulos, meses por ano, heatmap,
// montagem das linhas por ano). O desenho em si (jspdf) não é testado aqui.
import { describe, it, expect } from 'vitest'
import {
  fmtBRL, fmtBRLcurto, fmtN,
  rotuloPeriodo, rotuloFamilia, rotuloMetrica, rotuloTop, rotuloVisualizacao, rotuloAgrupamento,
  agruparMesesPorAno, nivelHeatmap, maxCelula, ordenarParaGrade, montarTabelaAno,
} from '../vendas-modelo-pdf'

describe('formatadores (iguais aos da tela)', () => {
  it('fmtBRL sem casas decimais', () => {
    expect(fmtBRL(75000)).toBe('R$ 75.000')
    expect(fmtBRL(null)).toBe('R$ 0')
  })
  it('fmtBRLcurto arredonda em k e M', () => {
    expect(fmtBRLcurto(1250000)).toBe('R$ 1,3M')
    expect(fmtBRLcurto(75400)).toBe('R$ 75k')
    expect(fmtBRLcurto(-75400)).toBe('-R$ 75k')
    expect(fmtBRLcurto(999)).toBe('R$ 999')
  })
  it('fmtN com separador BR', () => {
    expect(fmtN(1234)).toBe('1.234')
  })
})

describe('rótulos dos filtros', () => {
  it('período: meses ou "desde"', () => {
    expect(rotuloPeriodo('12', '2023-01')).toBe('12 meses')
    expect(rotuloPeriodo('__desde__', '2023-01')).toBe('desde 01/2023')
    expect(rotuloPeriodo('__desde__', '')).toBe('desde ?')
  })
  it('família: pseudo-valores viram texto', () => {
    expect(rotuloFamilia('')).toBe('Todas')
    expect(rotuloFamilia('__TODAS_MAQUINAS__')).toBe('Todas as máquinas')
    expect(rotuloFamilia('__SO_PECAS__')).toBe('Só peças')
    expect(rotuloFamilia('Trator Novo')).toBe('Trator Novo')
  })
  it('métrica, top, visualização, agrupamento', () => {
    expect(rotuloMetrica('receita')).toBe('Receita R$')
    expect(rotuloMetrica('qtd')).toBe('Quantidade')
    expect(rotuloMetrica('eventos')).toBe('Nº de vendas')
    expect(rotuloTop(50)).toBe('Top 50')
    expect(rotuloTop(0)).toBe('Todos')
    expect(rotuloVisualizacao('grade')).toBe('Grade anual')
    expect(rotuloVisualizacao('tabela')).toBe('Tabela')
    expect(rotuloAgrupamento('potencia')).toBe('Por potência')
    expect(rotuloAgrupamento('modelo')).toBe('Por modelo')
  })
})

describe('agruparMesesPorAno', () => {
  it('agrupa e ordena por ano, meses crescentes', () => {
    const r = agruparMesesPorAno(['2024-02', '2023-11', '2024-01', '2023-12'])
    expect(r).toEqual([
      { ano: 2023, meses: ['2023-11', '2023-12'] },
      { ano: 2024, meses: ['2024-01', '2024-02'] },
    ])
  })
  it('vazio devolve vazio', () => {
    expect(agruparMesesPorAno([])).toEqual([])
    expect(agruparMesesPorAno(undefined)).toEqual([])
  })
})

describe('nivelHeatmap (mesmos cortes da tela)', () => {
  it('0 quando não há valor ou máximo', () => {
    expect(nivelHeatmap(0, 100)).toBe(0)
    expect(nivelHeatmap(10, 0)).toBe(0)
  })
  it('cortes 0.05/0.2/0.4/0.6/0.8', () => {
    expect(nivelHeatmap(1, 100)).toBe(50)
    expect(nivelHeatmap(10, 100)).toBe(100)
    expect(nivelHeatmap(30, 100)).toBe(200)
    expect(nivelHeatmap(50, 100)).toBe(300)
    expect(nivelHeatmap(70, 100)).toBe(400)
    expect(nivelHeatmap(100, 100)).toBe(500)
    expect(nivelHeatmap(500, 100)).toBe(500) // clampa em 1
  })
})

const modelos = [
  { modelo: '6075E', familia: 'Trator Novo', _membros: ['6075E', '6075E CAB'],
    por_mes: { '2024-01': { qtd: 2, receita: 300000 }, '2024-04': { qtd: 1, receita: 150000 } },
    totais: { qtd: 3, receita: 450000, eventos: 3 } },
  { modelo: '9500', familia: 'Trator Novo', _membros: ['9500'],
    por_mes: { '2024-01': { qtd: 5, receita: 200000 } },
    totais: { qtd: 5, receita: 200000, eventos: 4 } },
]
const totaisPorMes = { '2024-01': { qtd: 7, receita: 500000 }, '2024-04': { qtd: 1, receita: 150000 } }

describe('maxCelula / ordenarParaGrade', () => {
  it('maior valor por célula na métrica', () => {
    expect(maxCelula(modelos, ['2024-01', '2024-04'], 'qtd')).toBe(5)
    expect(maxCelula(modelos, ['2024-01', '2024-04'], 'receita')).toBe(300000)
  })
  it('grade ordena por total da métrica, sem mutar a entrada', () => {
    const porQtd = ordenarParaGrade(modelos, 'qtd').map((m) => m.modelo)
    expect(porQtd).toEqual(['9500', '6075E'])
    const porReceita = ordenarParaGrade(modelos, 'receita').map((m) => m.modelo)
    expect(porReceita).toEqual(['6075E', '9500'])
    expect(modelos[0].modelo).toBe('6075E')
  })
})

describe('montarTabelaAno', () => {
  it('tabela: modelo, família, meses do ano, total do ano; buracos = 0', () => {
    const t = montarTabelaAno({
      ano: 2024, mesesDoAno: ['2024-01', '2024-04'], modelos, totaisPorMes,
      metrica: 'qtd', comFamilia: true, comTrimestres: false,
    })
    expect(t.cabecalho).toEqual(['Modelo', 'Família', 'Jan/24', 'Abr/24', 'Total 2024'])
    expect(t.primeiraColunaMes).toBe(2)
    expect(t.corpo[0]).toEqual(['6075E (2)', 'Trator Novo', 2, 1, 3])
    expect(t.corpo[1]).toEqual(['9500', 'Trator Novo', 5, 0, 5])
    expect(t.total).toEqual(['TOTAL', '', 7, 1, 8])
  })
  it('grade: sem família, com trimestres somados', () => {
    const t = montarTabelaAno({
      ano: 2024, mesesDoAno: ['2024-01', '2024-04'], modelos, totaisPorMes,
      metrica: 'receita', comFamilia: false, comTrimestres: true,
    })
    expect(t.cabecalho).toEqual(['Modelo', 'Jan/24', 'Abr/24', 'T1', 'T2', 'T3', 'T4', 'Total 2024'])
    expect(t.primeiraColunaMes).toBe(1)
    expect(t.corpo[0]).toEqual(['6075E (2)', 300000, 150000, 300000, 150000, 0, 0, 450000])
    expect(t.total).toEqual(['TOTAL', 500000, 150000, 500000, 150000, 0, 0, 650000])
  })
})
