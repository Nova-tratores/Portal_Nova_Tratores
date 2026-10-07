import { describe, it, expect } from 'vitest'
import { erroEmail, sugestaoEmail, normalizarEmail } from '../email'

describe('erroEmail', () => {
  it('caso real: ponto antes do @', () => {
    expect(erroEmail('caiqueoliveira.@novatratores.com')).toMatch(/ponto/)
  })
  it('formatos inválidos', () => {
    expect(erroEmail('')).toBeTruthy()
    expect(erroEmail('sem-arroba.com')).toMatch(/@/)
    expect(erroEmail('a@@b.com')).toBeTruthy()
    expect(erroEmail('a b@gmail.com')).toMatch(/espaço/)
    expect(erroEmail('a..b@gmail.com')).toMatch(/dois pontos/)
    expect(erroEmail('ana@gmail')).toMatch(/domínio/)
  })
  it('e-mails reais válidos', () => {
    expect(erroEmail('larissa.garcia@novatratores.com.br')).toBeNull()
    expect(erroEmail('lucas.novatratores@gmail.com')).toBeNull()
  })
})

describe('sugestaoEmail', () => {
  it('domínio da empresa sem o .br', () => {
    expect(sugestaoEmail('caiqueoliveira@novatratores.com')).toBe('caiqueoliveira@novatratores.com.br')
  })
  it('nome da empresa com letra faltando', () => {
    expect(sugestaoEmail('antonio.novatratoes@gmail.com')).toBe('antonio.novatratores@gmail.com')
  })
  it('gmail digitado errado', () => {
    expect(sugestaoEmail('ana@gmail.con')).toBe('ana@gmail.com')
    expect(sugestaoEmail('ana@gmial.com')).toBe('ana@gmail.com')
  })
  it('e-mail certo não sugere nada', () => {
    expect(sugestaoEmail('lucas.novatratores@gmail.com')).toBeNull()
    expect(sugestaoEmail('larissa.garcia@novatratores.com.br')).toBeNull()
  })
})

it('normalizarEmail', () => {
  expect(normalizarEmail('  Ana@Gmail.COM ')).toBe('ana@gmail.com')
})
