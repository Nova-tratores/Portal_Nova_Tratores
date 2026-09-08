import { describe, it, expect } from 'vitest'
import {
  normalizarCotacoes,
  resumoRequisicao,
  labelRequisicao,
  interpretarBusca,
  formatarBRL,
  statusReqInfo,
} from '../vinculos'

describe('normalizarCotacoes', () => {
  it('null/undefined → []', () => {
    expect(normalizarCotacoes(null)).toEqual([])
    expect(normalizarCotacoes(undefined)).toEqual([])
  })

  it('linha só com incluir_pdf (sem fornecedor) → []', () => {
    expect(normalizarCotacoes({ id: 1, incluir_pdf: true })).toEqual([])
  })

  it('preserva buracos: slots 1, 2 e 4 preenchidos, 3 vazio', () => {
    const out = normalizarCotacoes({
      fornecedor1: 'A', valor1: '1.234,56', servico_material1: 'PNEU',
      fornecedor2: 'B', valor2: '800.00',
      fornecedor3: '', valor3: '999',
      fornecedor4: '  C  ', valor4: '', obs4: 'frete incluso',
    })
    expect(out.map((c) => c.n)).toEqual([1, 2, 4])
    expect(out[0]).toMatchObject({ fornecedor: 'A', servico_material: 'PNEU', valor: 1234.56, valor_cru: '1.234,56' })
    // US "800.00" é 800, não 80.000 (bug real do FormFornecedor no passado)
    expect(out[1]).toMatchObject({ fornecedor: 'B', valor: 800, valor_cru: '800.00' })
    expect(out[2]).toMatchObject({ fornecedor: 'C', valor: null, valor_cru: '', obs: 'frete incluso' })
  })

  it('prefixo "R$ " (amostra real do banco) não zera o valor', () => {
    const [c] = normalizarCotacoes({ fornecedor1: 'PARADA PNEUS', valor1: 'R$ 1.980,00' })
    expect(c.valor).toBe(1980)
    expect(c.valor_cru).toBe('R$ 1.980,00')
    expect(normalizarCotacoes({ fornecedor1: 'X', valor1: 'R$' })[0].valor).toBeNull()
  })

  it('anexo: path cru sempre; URL só via callback do chamador (lib pura)', () => {
    const row = { fornecedor1: 'A', anexo1: '6352-cotacao1-1.pdf', fornecedor2: 'B' }
    const semCb = normalizarCotacoes(row)
    expect(semCb[0]).toMatchObject({ anexo: '6352-cotacao1-1.pdf', anexo_url: null })
    expect(semCb[1]).toMatchObject({ anexo: '', anexo_url: null })
    const comCb = normalizarCotacoes(row, (p) => `https://x/${p}`)
    expect(comCb[0].anexo_url).toBe('https://x/6352-cotacao1-1.pdf')
    expect(comCb[1].anexo_url).toBeNull()   // sem anexo não chama o callback
  })

  it('valor null vira valor:null e valor_cru vazio', () => {
    const [c] = normalizarCotacoes({ fornecedor1: 'X', valor1: null })
    expect(c.valor).toBeNull()
    expect(c.valor_cru).toBe('')
  })
})

describe('resumoRequisicao', () => {
  it('parseia valor BR e guarda o cru', () => {
    const r = resumoRequisicao({ id: 6423, titulo: 'PNEU', status: 'aguardando', valor_despeza: '1.550,00' })
    expect(r.valor).toBe(1550)
    expect(r.valor_cru).toBe('1.550,00')
    expect(r.id).toBe(6423)
  })

  it('valor vazio/null → null', () => {
    expect(resumoRequisicao({ id: 1, valor_despeza: null }).valor).toBeNull()
    expect(resumoRequisicao({ id: 1, valor_despeza: '' }).valor).toBeNull()
  })

  it('título vazio → "Requisição #id"', () => {
    expect(resumoRequisicao({ id: 77, titulo: '  ' }).titulo).toBe('Requisição #77')
  })

  it('id vem como string → number', () => {
    expect(resumoRequisicao({ id: '12' }).id).toBe(12)
  })
})

describe('labelRequisicao', () => {
  it('monta "#id TÍTULO"', () => {
    expect(labelRequisicao({ id: 6423, titulo: 'PNEU DIANTEIRO' })).toBe('#6423 PNEU DIANTEIRO')
  })
  it('sem título → só "#id"', () => {
    expect(labelRequisicao({ id: 6423 })).toBe('#6423')
    expect(labelRequisicao({ id: 6423, titulo: null })).toBe('#6423')
  })
  it('corta em 140', () => {
    expect(labelRequisicao({ id: 1, titulo: 'x'.repeat(300) }).length).toBe(140)
  })
})

describe('interpretarBusca', () => {
  it('número (com ou sem #, com espaços) → id', () => {
    expect(interpretarBusca('6423')).toEqual({ modo: 'id', id: 6423 })
    expect(interpretarBusca('#6423')).toEqual({ modo: 'id', id: 6423 })
    expect(interpretarBusca(' 6423 ')).toEqual({ modo: 'id', id: 6423 })
  })
  it('texto → remove vírgula e parênteses (quebram o .or() do PostgREST)', () => {
    expect(interpretarBusca('pneu, (x)')).toEqual({ modo: 'texto', texto: 'pneu x' })
  })
  it('vazio/null → recentes', () => {
    expect(interpretarBusca('')).toEqual({ modo: 'recentes' })
    expect(interpretarBusca(null)).toEqual({ modo: 'recentes' })
    expect(interpretarBusca(' , ')).toEqual({ modo: 'recentes' })
  })
  it('texto curto ainda é texto (a rota decide o mínimo)', () => {
    expect(interpretarBusca('ab')).toEqual({ modo: 'texto', texto: 'ab' })
  })
})

describe('formatarBRL / statusReqInfo', () => {
  it('null usa o cru ou travessão', () => {
    expect(formatarBRL(null, '1.550,00')).toBe('1.550,00')
    expect(formatarBRL(null)).toBe('—')
  })
  it('número formata em BRL', () => {
    expect(formatarBRL(1550).replace(/ /g, ' ')).toBe('R$ 1.550,00')
  })
  it('status desconhecido não quebra', () => {
    expect(statusReqInfo('zzz').label).toBe('zzz')
    expect(statusReqInfo('financeiro').label).toBe('Enviado financeiro')
  })
})
