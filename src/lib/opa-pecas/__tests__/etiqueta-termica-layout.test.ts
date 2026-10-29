import { describe, expect, it } from 'vitest'
import { fontesPadrao, htmlTermica, layoutPadrao, normalizarLayout, TERMICA_PADRAO } from '../etiqueta-termica'

const item = { codigo: 'ABC123', descricao: 'FILTRO', topo: 'NOVA TRATORES', local: 'PRAT 1 · AND A · CX 2', marca: 'KUHN', modelo: '6075E', semQr: true, qr: '' }

describe('layout da etiqueta térmica', () => {
  it('sem layout sai a etiqueta de sempre (marca/modelo não aparecem)', () => {
    const h = htmlTermica([item], TERMICA_PADRAO)
    expect(h).toContain('NOVA TRATORES')
    expect(h).not.toContain('KUHN')
  })

  it('respeita ordem, esconde campo e aplica fonte/negrito', () => {
    const layout = normalizarLayout([
      { campo: 'local', ver: true, fonte: 12, negrito: true },
      { campo: 'codigo', ver: true, fonte: 0, negrito: false },
      { campo: 'topo', ver: false, fonte: 0, negrito: true },
      { campo: 'descricao', ver: false, fonte: 0, negrito: true },
      { campo: 'marca', ver: true, fonte: 0, negrito: true },
    ])!
    const h = htmlTermica([{ ...item, layout }], TERMICA_PADRAO)
    expect(h).not.toContain('NOVA TRATORES')
    expect(h).not.toContain('FILTRO')
    expect(h).toContain('MARCA KUHN')
    expect(h).not.toContain('MODELO 6075E') // modelo entrou no fim, escondido (padrão)
    expect(h.indexOf('PRAT 1')).toBeLessThan(h.indexOf('ABC123'))
    expect(h).toContain('style="font-size:12pt"')
    expect(h).toContain('style="font-weight:400">ABC123')
  })

  it('normaliza lixo: campo desconhecido, repetido e fonte fora da faixa', () => {
    const l = normalizarLayout([{ campo: 'x' }, { campo: 'codigo', fonte: 99 }, { campo: 'codigo', fonte: 10 }])!
    expect(l.map((c) => c.campo)).toEqual(['codigo', 'topo', 'descricao', 'marca', 'modelo', 'local', 'extra'])
    expect(l[0].fonte).toBe(0)
    expect(normalizarLayout('nada')).toBeNull()
    expect(layoutPadrao().filter((c) => c.ver).map((c) => c.campo)).toEqual(['topo', 'codigo', 'descricao', 'local', 'extra'])
  })

  it('fontes automáticas acompanham a altura', () => {
    expect(fontesPadrao(30).codigo).toBeGreaterThan(fontesPadrao(20).codigo)
  })
})
