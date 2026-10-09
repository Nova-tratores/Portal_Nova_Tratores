import { describe, it, expect } from 'vitest'
import { validarNovoCliente, paramIncluirCliente, empresaCanonica, separarTelefone, type FormNovoCliente } from './novo-cliente'

const base: FormNovoCliente = {
  empresa: 'Nova Tratores', cnpj_cpf: '46.223.699/0001-50', razao_social: 'MUNICIPIO DE PIRAJU',
  cep: '18800-000', endereco: 'Praça Ataliba Leonel', numero: '173', bairro: 'Centro',
  cidade: 'Piraju', estado: 'sp', cidade_ibge: '3538808', inscricao_estadual: '', isento_ie: true,
  telefone: '(14) 99813-2198', email: 'compras@piraju.sp.gov.br',
}

describe('empresaCanonica', () => {
  it('normaliza a Castro sem acento (como o portal grava)', () => {
    expect(empresaCanonica('Castro Peças')).toBe('Castro Pecas')
    expect(empresaCanonica('Nova Tratores')).toBe('Nova Tratores')
    expect(empresaCanonica('x')).toBeNull()
  })
})

describe('validarNovoCliente', () => {
  it('cadastro completo passa', () => {
    expect(validarNovoCliente(base)).toEqual([])
  })
  it('acusa razão social acima de 60 (limite do Omie)', () => {
    const e = validarNovoCliente({ ...base, razao_social: 'A'.repeat(61) })
    expect(e.join(' ')).toMatch(/máximo 60/)
  })
  it('exige CEP, UF, cidade e endereço', () => {
    const e = validarNovoCliente({ ...base, cep: '', estado: '', cidade: '', endereco: '' })
    expect(e).toHaveLength(4)
  })
  it('CNPJ sem IE e sem marcar isento é barrado; CPF não precisa', () => {
    expect(validarNovoCliente({ ...base, isento_ie: false }).join(' ')).toMatch(/Inscrição estadual/)
    expect(validarNovoCliente({ ...base, cnpj_cpf: '529.982.247-25', isento_ie: false })).toEqual([])
  })
  it('documento e e-mail inválidos', () => {
    const e = validarNovoCliente({ ...base, cnpj_cpf: '11.111.111/1111-11', email: 'a@b' })
    expect(e.join(' ')).toMatch(/CNPJ\/CPF inválido/)
    expect(e.join(' ')).toMatch(/E-mail inválido/)
  })
})

describe('paramIncluirCliente', () => {
  it('monta no formato do cadastro manual do Omie', () => {
    const p = paramIncluirCliente(base)
    expect(p).toMatchObject({
      cnpj_cpf: '46.223.699/0001-50', pessoa_fisica: 'N', cep: '18800000', estado: 'SP',
      cidade: 'PIRAJU (SP)', cidade_ibge: '3538808', codigo_pais: '1058', endereco_numero: '173',
      telefone1_ddd: '14', telefone1_numero: '998132198', contribuinte: 'N', inscricao_estadual: 'ISENTO',
      tags: [{ tag: 'Cliente' }],
    })
  })
  it('com IE vira contribuinte; sem número vira S/N', () => {
    const p = paramIncluirCliente({ ...base, isento_ie: false, inscricao_estadual: '537.082.005.117', numero: '' })
    expect(p.contribuinte).toBe('S')
    expect(p.inscricao_estadual).toBe('537.082.005.117')
    expect(p.endereco_numero).toBe('S/N')
  })
  it('telefone com +55', () => {
    expect(separarTelefone('+55 14 99813-2198')).toEqual({ ddd: '14', numero: '998132198' })
  })
})
