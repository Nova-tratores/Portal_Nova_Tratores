import { describe, expect, it } from 'vitest'
import { extrairLinhas, filtrarLinhas, formatBR, ordDe, type TratorRow } from '../mahindra'

// A tabela `tratores` guarda datas como TEXTO em formatos misturados:
// dd/mm/aaaa (maioria) e yyyy-mm-dd (linhas vindas de <input type="date">).
// Estes testes travam o parse dos dois formatos — no banco real há revisões
// e entregas em ISO que um parse só-BR faria sumir do filtro e do Excel.

const base: TratorRow = {
  ID: '123',
  Modelo: 'OJA 3140',
  Chassis: 'CHS-1  ', // espaço à direita acontece no banco
  Cliente: 'Fulano',
  Cidade: 'Registro',
  Vendedor: 'Vend',
  Entrega: '10/01/2026',
  Numero_Motor: 'M-1',
}

describe('ordDe/formatBR', () => {
  it('aceita dd/mm/aaaa e yyyy-mm-dd apontando pro mesmo dia (UTC)', () => {
    expect(ordDe('11/03/2026')).toBe(Date.UTC(2026, 2, 11))
    expect(ordDe('2026-03-11')).toBe(Date.UTC(2026, 2, 11))
    expect(ordDe(' 11/03/2026 ')).toBe(Date.UTC(2026, 2, 11))
  })

  it('data ilegível vira 0 / volta como veio', () => {
    expect(ordDe('março de 2026')).toBe(0)
    expect(formatBR('março de 2026')).toBe('março de 2026')
  })

  it('normaliza ISO pra dd/mm/aaaa na exibição', () => {
    expect(formatBR('2026-03-04')).toBe('04/03/2026')
    expect(formatBR('04/03/2026')).toBe('04/03/2026')
  })
})

describe('extrairLinhas', () => {
  it('gera uma linha por revisão preenchida, com trim e Entrega normalizada', () => {
    const linhas = extrairLinhas([
      { ...base, Entrega: '2026-01-13', '50h Data': '24/03/2026', '50h Horimetro': ' 52 ', '900h Data': '' },
    ])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      tratorId: '123',
      revisao: '50h',
      data: '24/03/2026',
      horimetro: '52',
      chassis: 'CHS-1',
      entrega: '13/01/2026',
    })
  })

  it('revisão com data ISO entra ordenada pela data real (não afunda)', () => {
    const linhas = extrairLinhas([
      { ...base, ID: 'a', Chassis: 'A', '50h Data': '01/01/2026' },
      { ...base, ID: 'b', Chassis: 'B', '50h Data': '2026-03-11' },
    ])
    expect(linhas.map(l => l.data)).toEqual(['11/03/2026', '01/01/2026'])
  })

  it('inspeção de pré-entrega vira linha própria (colunas "Inspecao *")', () => {
    const linhas = extrairLinhas([
      { ...base, 'Inspecao Data': '14/05/2025', 'Inspecao Horimetro': '2', 'Inspecao PDF': 'http://x/insp.pdf', '50h Data': '23/06/2026' },
    ])
    expect(linhas.map(l => l.revisao)).toEqual(['50h', 'inspecao'])
    const insp = linhas.find(l => l.revisao === 'inspecao')!
    expect(insp).toMatchObject({ data: '14/05/2025', horimetro: '2', pdf: 'http://x/insp.pdf' })
  })

  it('empate de data desempata por chassi (ordem estável entre tela e Excel)', () => {
    const linhas = extrairLinhas([
      { ...base, ID: 'b', Chassis: 'ZZZ', '50h Data': '10/03/2026' },
      { ...base, ID: 'a', Chassis: 'AAA', '50h Data': '10/03/2026' },
    ])
    expect(linhas.map(l => l.chassis)).toEqual(['AAA', 'ZZZ'])
  })
})

describe('filtrarLinhas', () => {
  const linhas = extrairLinhas([
    { ...base, ID: '1', Chassis: 'C1', '50h Data': '05/03/2026' },
    { ...base, ID: '2', Chassis: 'C2', '50h Data': '2026-03-11' },
    { ...base, ID: '3', Chassis: 'C3', '900h Data': '20/04/2026', Cliente: 'Beltrano' },
    { ...base, ID: '4', Chassis: 'C4', 'Inspecao Data': '10/03/2026' },
  ])

  it('período De/Até inclui revisão gravada em ISO dentro do intervalo', () => {
    const marco = filtrarLinhas(linhas, { de: '2026-03-01', ate: '2026-03-31' })
    expect(marco.map(l => l.tratorId).sort()).toEqual(['1', '2', '4'])
  })

  it('só Até corta revisão datada depois do período (inclusive as em ISO)', () => {
    const soAte = filtrarLinhas(linhas, { ate: '2026-03-31' })
    expect(soAte.map(l => l.tratorId).sort()).toEqual(['1', '2', '4'])
  })

  it('tipo e busca', () => {
    expect(filtrarLinhas(linhas, { tipo: '900h' })).toHaveLength(1)
    expect(filtrarLinhas(linhas, { tipo: 'inspecao' }).map(l => l.tratorId)).toEqual(['4'])
    expect(filtrarLinhas(linhas, { q: 'beltrano' })[0].tratorId).toBe('3')
    expect(filtrarLinhas(linhas, { q: 'c2' })[0].tratorId).toBe('2')
  })
})
