import { describe, expect, it } from 'vitest'
import { mensagemErroFornecedor, normalizarSigla } from '../fornecedor-campos'

describe('normalizarSigla', () => {
  it('maiúsculas e sem espaço; vazia vira null', () => {
    expect(normalizarSigla('  koba ')).toBe('KOBA')
    expect(normalizarSigla('')).toBeNull()
    expect(normalizarSigla('   ')).toBeNull()
    expect(normalizarSigla(null)).toBeNull()
  })
})

describe('mensagemErroFornecedor', () => {
  it('sigla repetida', () => {
    const e = { code: '23505', message: 'duplicate key value violates unique constraint "fornecedores_sigla_uk"' }
    expect(mensagemErroFornecedor(e, 'KOBA')).toBe('Já existe um fornecedor com a sigla KOBA.')
  })
  it('sem a migration', () => {
    expect(mensagemErroFornecedor({ code: '42703', message: 'column "sigla" of relation "Fornecedores" does not exist' })).toMatch(/fornecedores-sigla-codigo/)
  })
  it('outros erros passam como vieram', () => {
    expect(mensagemErroFornecedor({ code: '500', message: 'falhou' })).toBe('falhou')
  })
})
