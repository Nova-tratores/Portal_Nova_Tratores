import { describe, it, expect } from 'vitest'
import { htmlReciboComissao, textoRecibo, liquidoRecibo, secaoRecibo, type DocRecibo } from '../recibo-comissao-doc'

const d = (x: Partial<DocRecibo> = {}): DocRecibo => ({
  codigo: 'AC-2026-10-ABC', tecnico: 'GABRIEL MORAES', cpf: '12345678901', mes: '2026-10', comissao: 750,
  descontos: [{ descricao: 'Ferramenta (parcela 1/3)', valor: 30 }], caixinha: 0,
  empresa: { razao: 'NOVA TRATORES MAQUINAS AGRICOLAS LTDA', cnpj: '12345678000199', cidade: 'Piraju' },
  logo: '/l.png', emitidoEm: '2026-11-05T12:00:00Z', ...x,
})

describe('recibo da comissão', () => {
  it('valor recebido = comissão − descontos − caixinha', () => {
    expect(liquidoRecibo(d())).toBe(720)
    expect(liquidoRecibo(d({ caixinha: 7.5 }))).toBe(712.5)
  })
  it('texto com CPF, CNPJ, extenso e quitação', () => {
    const t = textoRecibo(d()).replace(/\s/g, ' ')
    expect(t).toContain('Gabriel Moraes, CPF 123.456.789-01')
    expect(t).toContain('CNPJ 12.345.678/0001-99')
    expect(t).toContain('R$ 720,00 (setecentos e vinte reais)')
    expect(t).toContain('outubro de 2026')
    expect(t).toContain('menos R$ 30,00 de descontos')
    expect(t).toContain('plena quitação')
    expect(textoRecibo(d({ descontos: [] }))).not.toContain('descontos')
  })
  it('folha: cidade, linha de assinatura e página própria quando vai junto', () => {
    const h = htmlReciboComissao(d())
    expect(h).toContain('RECIBO')
    expect(h).toContain('Piraju, ______ de')
    expect(htmlReciboComissao(d({ empresa: { razao: 'X' } }))).toContain('____________________, ______ de')
    expect(secaoRecibo(d()).css).toContain('page-break-before: always')
  })
})
