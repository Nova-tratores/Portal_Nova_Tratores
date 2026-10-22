import { describe, expect, it } from 'vitest'
import { corConcluida, textoSolicitacao, validarResservico } from '../resservico'

describe('resserviço da OS', () => {
  const ok = { status: 'Concluída', jaTem: false, ehResservico: false }
  it('valida motivo, o que fez de errado e a OS', () => {
    expect(validarResservico({ motivo: 'vazamento', erro: 'não reapertou a mangueira' }, ok)).toBeNull()
    expect(validarResservico({ motivo: 'xx', erro: 'não reapertou a mangueira' }, ok)).toMatch(/motivo/)
    expect(validarResservico({ motivo: 'vazamento', erro: 'ok' }, ok)).toMatch(/errado/)
    expect(validarResservico({ motivo: 'vazamento', erro: 'não reapertou' }, { ...ok, jaTem: true })).toMatch(/já tem/)
    expect(validarResservico({ motivo: 'vazamento', erro: 'não reapertou' }, { ...ok, ehResservico: true })).toMatch(/original/)
    expect(validarResservico({ motivo: 'vazamento', erro: 'não reapertou' }, { ...ok, status: 'Cancelada' })).toMatch(/cancelada/)
  })
  it('texto que o técnico lê no app começa pelo resserviço e traz o serviço original', () => {
    const t = textoSolicitacao({ id: 'OS-0793', servSolicitado: 'Revisão de 1500 horas' }, { motivo: 'vazamento', erro: 'Mangueira solta ' })
    expect(t.split('\n')[0]).toBe('RESSERVIÇO da OS-0793 — Vazamento depois do serviço')
    expect(t).toContain('O que precisa refazer: Mangueira solta')
    expect(t).toContain('Revisão de 1500 horas')
  })
  it('cor em Concluída: verde normal, vermelha com resserviço', () => {
    expect(corConcluida({ status: 'Concluída' })).toBe('ok')
    expect(corConcluida({ status: 'Concluída', resservico: { os: 'OS-1' } })).toBe('resservico')
    expect(corConcluida({ status: 'Execução' })).toBeNull()
  })
})
