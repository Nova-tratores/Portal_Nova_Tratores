import { describe, expect, it } from 'vitest'
import { faltaLancar, gerarParcelas, lerValor, parcelasParaTexto, somarMeses, validarNovaConta, type NovaConta } from '../lancar-conta'

const base: NovaConta = {
  fornecedor: 'KOBA PARAFUSOS', fornecedorTemDocumento: true, valor: '100,00', metodo: 'Boleto',
  vencimento: '2026-11-20', parcelas: [], numeroNF: '123', motivo: 'Parafusos', autonomoSemNota: false,
  temAnexoNF: true, temBoleto: true,
}

describe('lerValor', () => {
  it('formatos BR e US', () => {
    expect(lerValor('1.234,56')).toBe(1234.56)
    expect(lerValor('1234,56')).toBe(1234.56)
    expect(lerValor('1234.56')).toBe(1234.56)
    expect(lerValor('R$ 1.234')).toBe(1234)
    expect(lerValor('1.234.567')).toBe(1234567)
    expect(lerValor('')).toBeNaN()
  })
})

describe('parcelas', () => {
  it('fim de mês não pula', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2026-11-15', 2)).toBe('2027-01-15')
  })
  it('centavos que sobram vão na última', () => {
    const ps = gerarParcelas(100, 3, '2026-11-10')
    expect(ps.map((p) => p.valor)).toEqual(['33.33', '33.33', '33.34'])
    expect(ps.map((p) => p.vencimento)).toEqual(['2026-11-10', '2026-12-10', '2027-01-10'])
    expect(parcelasParaTexto(ps)).toBe('2026-11-10|33.33, 2026-12-10|33.33, 2027-01-10|33.34')
  })
})

describe('validarNovaConta', () => {
  it('completa passa', () => expect(validarNovaConta(base)).toEqual([]))
  it('fornecedor sem documento', () => expect(validarNovaConta({ ...base, fornecedorTemDocumento: false })[0]).toMatch(/CPF\/CNPJ/))
  it('autônomo e Carnê ISS dispensam a nota', () => {
    expect(validarNovaConta({ ...base, numeroNF: '' })).toHaveLength(1)
    expect(validarNovaConta({ ...base, numeroNF: '', autonomoSemNota: true })).toEqual([])
    expect(validarNovaConta({ ...base, numeroNF: '', metodo: 'Carnê ISS' })).toEqual([])
  })
  it('anexos que o Omie exige', () => {
    expect(validarNovaConta({ ...base, temAnexoNF: false }).join()).toMatch(/Anexe a nota/)
    expect(validarNovaConta({ ...base, temBoleto: false }).join()).toMatch(/Anexe o boleto/)
    expect(validarNovaConta({ ...base, metodo: 'Pix', temBoleto: false })).toEqual([])
    expect(validarNovaConta({ ...base, autonomoSemNota: true, numeroNF: '', temAnexoNF: false, temBoleto: false })).toEqual([])
  })
  it('parcelado confere a soma', () => {
    const p = { ...base, metodo: 'Boleto Parcelado', vencimento: '', parcelas: gerarParcelas(100, 2, '2026-11-10') }
    expect(validarNovaConta(p)).toEqual([])
    expect(validarNovaConta({ ...p, valor: '120' }).join()).toMatch(/não bate/)
  })
})

describe('faltaLancar', () => {
  it('só o que está vivo e sem código', () => {
    expect(faltaLancar({ status: 'financeiro', status_envio: 'rascunho' })).toBe(true)
    expect(faltaLancar({ status: 'aguardando_omie', status_envio: 'erro' })).toBe(true)
    expect(faltaLancar({ status: 'concluido', status_envio: 'rascunho' })).toBe(false)
    expect(faltaLancar({ status: 'financeiro', omie_cod_lancamento: '123' })).toBe(false)
  })
})
