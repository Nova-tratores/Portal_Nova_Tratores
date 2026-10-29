import { describe, expect, it } from 'vitest'
import { caminhoDoLink, comEnderecoCompleto, estacaoOnline, haQuanto, limparItens } from '../estacao'

const AGORA = Date.parse('2026-10-26T15:00:00Z')

describe('estacaoOnline', () => {
  it('ligada com sinal recente, desligada sem sinal ou com sinal velho', () => {
    expect(estacaoOnline('2026-10-26T14:59:30Z', AGORA)).toBe(true)
    expect(estacaoOnline('2026-10-26T14:58:00Z', AGORA)).toBe(false)
    expect(estacaoOnline(null, AGORA)).toBe(false)
    expect(estacaoOnline('lixo', AGORA)).toBe(false)
  })
})

describe('haQuanto', () => {
  it('fala em minutos, horas e dias', () => {
    expect(haQuanto('2026-10-26T14:59:50Z', AGORA)).toBe('agora')
    expect(haQuanto('2026-10-26T14:48:00Z', AGORA)).toBe('há 12 min')
    expect(haQuanto('2026-10-26T12:00:00Z', AGORA)).toBe('há 3 h')
    expect(haQuanto('2026-10-22T15:00:00Z', AGORA)).toBe('há 4 dias')
    expect(haQuanto(null, AGORA)).toBe('nunca')
  })
})

describe('caminhoDoLink', () => {
  it('guarda só o caminho do portal', () => {
    expect(caminhoDoLink('https://portal.novatratores.com/p/123e4567-e89b-12d3-a456-426614174000')).toBe('/p/123e4567-e89b-12d3-a456-426614174000')
    expect(caminhoDoLink('http://localhost:3000/opa/patrimonio/abc')).toBe('/opa/patrimonio/abc')
    expect(caminhoDoLink('/e/AbC_12-x')).toBe('/e/AbC_12-x')
  })
  it('recusa o que não é caminho simples', () => {
    expect(caminhoDoLink('javascript:alert(1)')).toBeUndefined()
    expect(caminhoDoLink('/a/../b')).toBeUndefined()
    expect(caminhoDoLink('/a?b=1')).toBeUndefined()
    expect(caminhoDoLink('')).toBeUndefined()
  })
})

describe('limparItens', () => {
  it('mantém só os campos do desenho e corta textos longos', () => {
    const r = limparItens([{ codigo: ' 0734309419 ', descricao: 'x'.repeat(400), local: 'PRAT 3', semQr: true, barra: true, locGrande: true, topo: 'NOVA', extra: 'CASTRO', info: 'MARCA KUHN', lixo: 'fora', quantidade: 2 }])
    expect('itens' in r).toBe(true)
    if (!('itens' in r)) return
    expect(r.itens[0]).toEqual({ codigo: '0734309419', descricao: 'x'.repeat(300), local: 'PRAT 3', semQr: true, barra: true, locGrande: true, topo: 'NOVA', extra: 'CASTRO', info: 'MARCA KUHN', quantidade: 2 })
  })
  it('converte o link do QR em caminho', () => {
    const r = limparItens([{ codigo: 'PAT-1', descricao: null, url: 'https://portal.novatratores.com/opa/patrimonio/9' }])
    expect('itens' in r && r.itens[0].url).toBe('/opa/patrimonio/9')
  })
  it('recusa lista vazia, sem código, QR sem link, token estranho e link de fora', () => {
    expect(limparItens([])).toEqual({ erro: 'Nenhuma etiqueta.' })
    expect('erro' in limparItens([{ descricao: 'a' }])).toBe(true)
    expect('erro' in limparItens([{ codigo: 'A' }])).toBe(true)
    expect('erro' in limparItens([{ codigo: 'A', token: 'a b' }])).toBe(true)
    expect('erro' in limparItens([{ codigo: 'A', url: 'javascript:x' }])).toBe(true)
    expect('erro' in limparItens(Array.from({ length: 501 }, () => ({ codigo: 'A', semQr: true })))).toBe(true)
  })
})

describe('comEnderecoCompleto', () => {
  it('põe o endereço da estação na frente do caminho', () => {
    expect(comEnderecoCompleto([{ codigo: 'A', descricao: null, url: '/p/1' }, { codigo: 'B', descricao: null, token: 't' }], 'https://portal.novatratores.com'))
      .toEqual([{ codigo: 'A', descricao: null, url: 'https://portal.novatratores.com/p/1' }, { codigo: 'B', descricao: null, token: 't' }])
  })
  it('leva o layout e marca/modelo da etiqueta, arrumando o layout', () => {
    const r = limparItens([{ codigo: 'A1', semQr: true, marca: 'KUHN', modelo: '6075E', layout: [{ campo: 'local', ver: true, fonte: 12, negrito: false }, { campo: 'hack', ver: true }] }])
    if (!('itens' in r)) throw new Error('esperava itens')
    expect(r.itens[0].marca).toBe('KUHN')
    expect(r.itens[0].modelo).toBe('6075E')
    expect(r.itens[0].layout?.[0]).toEqual({ campo: 'local', ver: true, fonte: 12, negrito: false })
    expect(r.itens[0].layout?.some((l) => (l.campo as string) === 'hack')).toBe(false)
  })
})
