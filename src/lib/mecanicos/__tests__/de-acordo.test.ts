import { describe, it, expect } from 'vitest'
import { valorPorExtenso, textoDeAcordo, validarCiencia, aceitaCiencia } from '../de-acordo'
import { htmlAutorizacaoComissao, type DocAutorizacao } from '../autorizacao-comissao-doc'

describe('valor por extenso', () => {
  it('casos comuns', () => {
    expect(valorPorExtenso(0)).toBe('zero real')
    expect(valorPorExtenso(1)).toBe('um real')
    expect(valorPorExtenso(0.5)).toBe('cinquenta centavos')
    expect(valorPorExtenso(100)).toBe('cem reais')
    expect(valorPorExtenso(101)).toBe('cento e um reais')
    expect(valorPorExtenso(1234.56)).toBe('mil, duzentos e trinta e quatro reais e cinquenta e seis centavos')
    expect(valorPorExtenso(2500)).toBe('dois mil e quinhentos reais')
    expect(valorPorExtenso(1020)).toBe('mil e vinte reais')
    expect(valorPorExtenso(15000.01)).toBe('quinze mil reais e um centavo')
    expect(valorPorExtenso(1000000)).toBe('um milhão de reais')
  })
})

describe('de acordo do técnico', () => {
  it('só depois de autorizada', () => {
    expect(aceitaCiencia({ status: 'espelhada', decidido_em: '2026-11-01' })).toBe(true)
    expect(aceitaCiencia({ status: 'aguardando', decidido_em: null })).toBe(false)
  })
  it('texto com valor, extenso e líquido só quando difere', () => {
    const t = textoDeAcordo({ nome: 'Gabriel Moraes', mes: '2026-10', comissao: 1500, liquido: 1500, temDescontos: false, pagamento: '2026-11-10' })
    expect(t).toContain('outubro de 2026')
    expect(t).toContain('mil e quinhentos reais')
    expect(t).toContain('10/11/2026')
    expect(t).not.toContain('líquido')
    expect(textoDeAcordo({ nome: 'X', mes: '2026-10', comissao: 1500, liquido: 1400, temDescontos: true })).toContain('líquido é de')
  })
  it('validação', () => {
    expect(validarCiencia({ acao: 'de_acordo', forma: 'papel', temArquivo: false, nome: 'A' })).toMatch(/Anexe/)
    expect(validarCiencia({ acao: 'de_acordo', forma: 'papel', temArquivo: true, nome: 'A' })).toBeNull()
    expect(validarCiencia({ acao: 'de_acordo', forma: 'tela', temAssinatura: false, nome: 'A' })).toMatch(/assinatura/)
    expect(validarCiencia({ acao: 'contestou', motivo: 'oi' })).toMatch(/por que/)
    expect(validarCiencia({ acao: 'contestou', motivo: 'a OS 5 não foi dividida' })).toBeNull()
  })
  it('documento autorizado traz a parte do técnico em branco ou assinada', () => {
    const base: DocAutorizacao = {
      codigo: 'AC-2026-10-ABC', tecnico: 'Gabriel Moraes', mes: '2026-10', linhas: [{ os: '1', numero: '1', data: null, cliente: 'X', grupo: 'cliente', regra: '', calculado: 100, valor: 100, acao: 'pagar' }],
      solicitante: { nome: 'A', papel: 'p', em: '2026-11-01T10:00:00Z', imagem: null }, diretor: { nome: 'D', papel: 'Diretor', em: '2026-11-02T10:00:00Z', imagem: null },
      logo: '/l.png', emitidoEm: '2026-11-05T10:00:00Z', caixinhaPct: 0,
    }
    const branco = htmlAutorizacaoComissao(base)
    expect(branco).toContain('De acordo do técnico')
    expect(branco).toContain('Data: ______')
    const papel = htmlAutorizacaoComissao({ ...base, tecnicoAcordo: { forma: 'papel', nome: 'Gabriel', em: '2026-11-05T12:00:00Z', registradoPor: 'Henri' } })
    expect(papel).toContain('Assinado no papel')
    const contestou = htmlAutorizacaoComissao({ ...base, tecnicoAcordo: { forma: null, contestou: 'OS 1 era minha' } })
    expect(contestou).toContain('não concordou')
    expect(htmlAutorizacaoComissao({ ...base, diretor: null })).not.toContain('De acordo do técnico')
  })
})
