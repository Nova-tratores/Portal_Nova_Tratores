import { describe, expect, it } from 'vitest'
import {
  agregadosLegados, exibeDesloc, exibeMaoObra, linhaPreenchida, linhasDoOrcamento,
  nomesServicos, novaLinha, somaHorasKm, subtotalLinha, totaisServicos,
  VALOR_HORA_PADRAO, VALOR_KM_PADRAO,
} from '../servicos'

const embreagem = novaLinha({ descricao: 'Troca de embreagem', horas: 8, km: 120 })
const diferencial = novaLinha({ descricao: 'Troca do diferencial', horas: 4, desloc: false })

describe('linhasDoOrcamento', () => {
  it('usa o array novo quando existe, saneando números em string', () => {
    const linhas = linhasDoOrcamento({
      servicos: [{ descricao: 'X', horas: '8', valorHora: '193', km: '120', valorKm: '2.8', maoObra: true, desloc: true }],
      mao_obra: { valorHora: 999, horas: 999 }, // ignorado quando servicos existe
    })
    expect(linhas).toHaveLength(1)
    expect(linhas[0].horas).toBe(8)
    expect(linhas[0].valorKm).toBe(2.8)
  })

  it('converte o formato legado numa linha única sem nome', () => {
    const linhas = linhasDoOrcamento({
      mao_obra: { valorHora: 193, horas: 6 },
      deslocamento: { valorKm: 2.8, km: 40 },
    })
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ descricao: '', maoObra: true, horas: 6, desloc: true, km: 40 })
  })

  it('legado só com mão de obra: deslocamento nasce desligado', () => {
    const [l] = linhasDoOrcamento({ mao_obra: { valorHora: 193, horas: 2 }, deslocamento: null })
    expect(l.maoObra).toBe(true)
    expect(l.desloc).toBe(false)
    expect(l.valorKm).toBe(VALOR_KM_PADRAO)
  })

  it('orçamento só de peças → sem linhas', () => {
    expect(linhasDoOrcamento({ mao_obra: null, deslocamento: null })).toEqual([])
    expect(linhasDoOrcamento({})).toEqual([])
  })

  it('linha antiga em servicos SEM as flags: infere pelo valor preenchido', () => {
    const [l] = linhasDoOrcamento({ servicos: [{ descricao: 'Y', horas: 3, km: 0 }] })
    expect(l.maoObra).toBe(true)
    expect(l.desloc).toBe(false)
    expect(l.mostrarMO).toBe(false)
  })
})

describe('totais e subtotais', () => {
  it('soma só as partes LIGADAS', () => {
    const t = totaisServicos([embreagem, diferencial])
    expect(t.horas).toBe(12)
    expect(t.km).toBe(120) // o diferencial tem desloc desligado
    expect(t.maoObra).toBe(12 * VALOR_HORA_PADRAO)
    expect(t.desloc).toBeCloseTo(120 * VALOR_KM_PADRAO)
    expect(t.total).toBeCloseTo(t.maoObra + t.desloc)
  })

  it('parte desligada mas marcada pra MOSTRAR não entra na conta', () => {
    const cortesia = novaLinha({ horas: 8, km: 120, desloc: false, mostrarDesloc: true })
    expect(subtotalLinha(cortesia)).toBe(8 * VALOR_HORA_PADRAO)
    expect(totaisServicos([cortesia]).km).toBe(0)
    // mas ela É exibida no PDF
    expect(exibeDesloc(cortesia)).toBe(true)
  })

  it('exibe: cobrada aparece, desligada só aparece se marcada', () => {
    expect(exibeMaoObra(novaLinha({ horas: 4 }))).toBe(true)
    expect(exibeMaoObra(novaLinha({ horas: 4, maoObra: false }))).toBe(false)
    expect(exibeMaoObra(novaLinha({ horas: 4, maoObra: false, mostrarMO: true }))).toBe(true)
    // sem quantidade não aparece nem marcada
    expect(exibeDesloc(novaLinha({ km: 0, desloc: false, mostrarDesloc: true }))).toBe(false)
  })
})

describe('agregados legados (compat com gerar OS / importar / chips)', () => {
  it('grava a soma das linhas ativas', () => {
    const agg = agregadosLegados([embreagem, diferencial])
    expect(agg.mao_obra).toEqual({ valorHora: VALOR_HORA_PADRAO, horas: 12 })
    expect(agg.deslocamento).toEqual({ valorKm: VALOR_KM_PADRAO, km: 120 })
  })

  it('sem horas/km ativos grava null (não zera a OS à toa)', () => {
    const agg = agregadosLegados([novaLinha({ horas: 0, km: 0 })])
    expect(agg.mao_obra).toBeNull()
    expect(agg.deslocamento).toBeNull()
  })

  it('somaHorasKm lê o formato que existir', () => {
    expect(somaHorasKm({ servicos: [embreagem, diferencial] })).toEqual({ horas: 12, km: 120 })
    expect(somaHorasKm({ mao_obra: { valorHora: 193, horas: 5 }, deslocamento: { valorKm: 2.8, km: 30 } }))
      .toEqual({ horas: 5, km: 30 })
  })
})

describe('nomes e preenchimento', () => {
  it('nomesServicos ignora linhas sem nome', () => {
    expect(nomesServicos([embreagem, novaLinha(), diferencial]))
      .toEqual(['Troca de embreagem', 'Troca do diferencial'])
  })

  it('linhaPreenchida: nome OU parte visível', () => {
    expect(linhaPreenchida(novaLinha({ horas: 0, km: 0 }))).toBe(false)
    expect(linhaPreenchida(novaLinha({ descricao: 'X', horas: 0, km: 0 }))).toBe(true)
    expect(linhaPreenchida(novaLinha({ horas: 2 }))).toBe(true)
    // desligada mas marcada pra mostrar conta como preenchida
    expect(linhaPreenchida(novaLinha({ horas: 2, maoObra: false, mostrarMO: true, km: 0 }))).toBe(true)
    expect(linhaPreenchida(novaLinha({ horas: 2, maoObra: false, km: 0 }))).toBe(false)
  })
})
