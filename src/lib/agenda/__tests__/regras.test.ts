import { describe, it, expect } from 'vitest'
import {
  ocorrencias, organizarColunas, empilharTopo, setorDe, coresPorPessoa, textoSobre, diasDaOS, faixasDeDias,
  periodoDoHorario, validarEvento, ultimoDia, tocaDia, noTopo, gradeDoMes, domingoDe, somarMeses, solicitacaoDaOS,
  osEmAberto, casaItem, rotuloHorario, isoDe, PALETA, type ItemAgenda,
} from '../regras'

describe('ocorrencias', () => {
  it('semanal dentro da janela, respeitando exceções e "até"', () => {
    expect(ocorrencias('2026-10-05', 'semanal', null, [], '2026-10-01', '2026-10-31')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(ocorrencias('2026-10-05', 'semanal', '2026-10-15', ['2026-10-12'], '2026-10-01', '2026-10-31')).toEqual(['2026-10-05'])
  })
  it('série antiga pula direto para a janela', () => {
    expect(ocorrencias('2020-01-06', 'semanal', null, [], '2026-10-12', '2026-10-18')).toEqual(['2026-10-12'])
  })
  it('dias úteis não cai no fim de semana', () => {
    expect(ocorrencias('2026-10-16', 'dias_uteis', null, [], '2026-10-16', '2026-10-20')).toEqual(['2026-10-16', '2026-10-19', '2026-10-20'])
  })
  it('mensal no dia 31 pula os meses sem 31', () => {
    expect(ocorrencias('2026-01-31', 'mensal', null, [], '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-03-31', '2026-05-31'])
  })
  it('pega ocorrência que começou antes e invade a janela', () => {
    expect(ocorrencias('2026-10-01', 'diaria', null, [], '2026-10-10', '2026-10-10', 2)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10'])
  })
})

describe('organizarColunas', () => {
  it('lado a lado só quem se sobrepõe', () => {
    const r = organizarColunas([{ id: 'a', ini: 540, fim: 600 }, { id: 'b', ini: 570, fim: 630 }, { id: 'c', ini: 700, fim: 760 }])
    expect(r.get('a')).toEqual({ col: 0, total: 2 })
    expect(r.get('b')).toEqual({ col: 1, total: 2 })
    expect(r.get('c')).toEqual({ col: 0, total: 1 })
  })
  it('reaproveita coluna livre', () => {
    const r = organizarColunas([{ id: 'a', ini: 0, fim: 100 }, { id: 'b', ini: 10, fim: 30 }, { id: 'c', ini: 40, fim: 60 }])
    expect(r.get('c')?.col).toBe(1)
    expect(r.get('a')?.total).toBe(2)
  })
})

it('empilharTopo põe barras que se cruzam em linhas diferentes', () => {
  const r = empilharTopo([{ id: 'a', ini: '2026-10-12', fim: '2026-10-14' }, { id: 'b', ini: '2026-10-13', fim: '2026-10-13' }, { id: 'c', ini: '2026-10-15', fim: '2026-10-15' }])
  expect([r.get('a'), r.get('b'), r.get('c')]).toEqual([0, 1, 0])
})

describe('setorDe', () => {
  it('normaliza as funções do cadastro', () => {
    expect(setorDe('Pós Vendas', false)).toBe('Pós-Vendas')
    expect(setorDe('Pós-Vendas', false)).toBe('Pós-Vendas')
    expect(setorDe('Peças', false)).toBe('Peças')
    expect(setorDe('T.I.', false)).toBe('T.I.')
    expect(setorDe('Técnico', false)).toBe('Técnicos')
    expect(setorDe('Pós Vendas', true)).toBe('Técnicos')
    expect(setorDe(null, false)).toBe('Outros')
    expect(setorDe('Técnico (TESTE)', true)).toBeNull()
    expect(setorDe('Teste', false)).toBeNull()
    expect(setorDe('marketing', false)).toBe('Marketing')
  })
})

it('cores distintas por pessoa e texto legível', () => {
  const c = coresPorPessoa([{ id: '1', nome: 'B' }, { id: '2', nome: 'A' }])
  expect(c.get('2')).toBe(PALETA[0].cor)
  expect(c.get('1')).toBe(PALETA[1].cor)
  expect(textoSobre('#f6bf26')).toBe('#202124')
  expect(textoSobre('#3f51b5')).toBe('#fff')
})

describe('OS do POS', () => {
  it('dias de execução: lista ou previsão', () => {
    expect(diasDaOS({ Dias_Execucao: '2026-10-13,2026-10-10, 2026-10-12', Previsao_Execucao: '2026-10-01' })).toEqual(['2026-10-10', '2026-10-12', '2026-10-13'])
    expect(diasDaOS({ Dias_Execucao: '', Previsao_Execucao: '2026-10-15', Data: '2026-10-13' })).toEqual(['2026-10-15'])
    expect(diasDaOS({ Dias_Execucao: null, Previsao_Execucao: null, Data: '2026-10-13' })).toEqual(['2026-10-13'])
  })
  it('faixas juntam dias seguidos e atravessam o domingo', () => {
    expect(faixasDeDias(['2026-10-10', '2026-10-12', '2026-10-13', '2026-10-15'])).toEqual([['2026-10-10', '2026-10-13'], ['2026-10-15', '2026-10-15']])
  })
  it('solicitação e status', () => {
    expect(solicitacaoDaOS('Modelo: 6075E\nSolicitação do cliente: LIMPEZA FILTRO\nServiço Realizado: ')).toBe('LIMPEZA FILTRO')
    expect(osEmAberto('Execução')).toBe(true)
    expect(osEmAberto('Aguardando ordem Técnico')).toBe(true)
    expect(osEmAberto('Concluída')).toBe(false)
  })
})

it('período da Lousa a partir do horário', () => {
  expect(periodoDoHorario('08:00', '11:00')).toBe('manha')
  expect(periodoDoHorario('14:00', '16:00')).toBe('tarde')
  expect(periodoDoHorario('09:00', '17:00')).toBe('dia')
})

describe('validarEvento', () => {
  it('horário', () => {
    const v = validarEvento({ titulo: ' Visita ', diaIni: '2026-10-16', horaIni: '09:00', diaFim: '2026-10-16', horaFim: '10:30', participantes: ['x', '2e388084-1295-4727-8743-4d4c29d54dd9'] })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.campos.inicio).toBe('2026-10-16T09:00:00-03:00')
      expect(v.campos.participantes).toHaveLength(1)
    }
  })
  it('dia inteiro: fim exclusivo', () => {
    const v = validarEvento({ titulo: 'Férias', diaInteiro: true, diaIni: '2026-10-19', diaFim: '2026-10-23' })
    expect(v.ok && v.campos.fim).toBe('2026-10-24T00:00:00-03:00')
  })
  it('erros', () => {
    expect(validarEvento({ titulo: '', diaIni: '2026-10-16' }).ok).toBe(false)
    expect(validarEvento({ titulo: 'a', diaIni: '2026-10-16', horaIni: '10:00', horaFim: '09:00' }).ok).toBe(false)
    expect(validarEvento({ titulo: 'a', diaIni: '2026-10-16', horaIni: '10:00', horaFim: '11:00', recorrencia: { freq: 'anual' } }).ok).toBe(false)
  })
})

describe('datas', () => {
  const dia = (a: string, b: string, inteiro = true) => ({ inicio: isoDe(a, '00:00'), fim: isoDe(b, '00:00'), diaInteiro: inteiro })
  it('ultimoDia / tocaDia / noTopo', () => {
    expect(ultimoDia(dia('2026-10-19', '2026-10-24'))).toBe('2026-10-23')
    expect(tocaDia(dia('2026-10-19', '2026-10-24'), '2026-10-24')).toBe(false)
    expect(noTopo({ inicio: isoDe('2026-10-16', '09:00'), fim: isoDe('2026-10-16', '10:00'), diaInteiro: false })).toBe(false)
    expect(noTopo({ inicio: isoDe('2026-10-16', '22:00'), fim: isoDe('2026-10-17', '02:00'), diaInteiro: false })).toBe(true)
  })
  it('grade do mês começa no domingo', () => {
    const g = gradeDoMes('2026-10-15')
    expect(g[0]).toBe('2026-09-27')
    expect(g).toHaveLength(42)
    expect(domingoDe('2026-10-15')).toBe('2026-10-11')
    expect(somarMeses('2026-12-10', 1)).toBe('2027-01-01')
  })
  it('rótulo', () => {
    expect(rotuloHorario({ inicio: isoDe('2026-10-16', '09:00'), fim: isoDe('2026-10-16', '10:30'), diaInteiro: false })).toBe('sexta-feira, 16 de outubro · 09:00 – 10:30')
  })
})

it('busca por título, pessoa e detalhe sem acento', () => {
  const it0 = { id: '1', ref: '1', fonte: 'os', titulo: 'OS-0835 · ADRIANO', inicio: '', fim: '', diaInteiro: true, pessoas: ['p'], detalhes: [['Cidade', 'TIMBURI (SP)']] } as ItemAgenda
  const nomes = new Map([['p', 'Danilo de Souza']])
  expect(casaItem(it0, 'danilo timburi', nomes)).toBe(true)
  expect(casaItem(it0, 'gabriel', nomes)).toBe(false)
})
