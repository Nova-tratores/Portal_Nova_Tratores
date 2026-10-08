import { describe, it, expect } from 'vitest'
import { statusDisponiveis } from '../constantes'
import { colunaDoStatus, type QuadroColuna } from '../quadros'

describe('fases do ticket', () => {
  it('quem faz volta de fase (inclusive para aberto)', () => {
    expect(statusDisponiveis('em_andamento', true, false, false)).toContain('aberto')
    expect(statusDisponiveis('aguardando_terceiro', true, false, false)).toEqual(
      expect.arrayContaining(['aberto', 'em_andamento', 'aguardando_interno', 'resolvido']))
  })
  it('resolvido volta para qualquer fase ativa, mas quem faz não fecha', () => {
    const r = statusDisponiveis('resolvido', true, false, false)
    expect(r).toEqual(expect.arrayContaining(['aberto', 'em_andamento', 'aguardando_terceiro', 'aguardando_interno']))
    expect(r).not.toContain('fechado')
  })
  it('quem pediu confirma, contesta ou cancela o resolvido', () => {
    expect(statusDisponiveis('resolvido', false, true, false).sort()).toEqual(['cancelado', 'em_andamento', 'fechado'])
  })
  it('quem só acompanha não muda nada', () => {
    expect(statusDisponiveis('em_andamento', false, false, false)).toEqual([])
  })
  it('encerrado: só admin reabre', () => {
    expect(statusDisponiveis('fechado', true, true, false)).toEqual([])
    expect(statusDisponiveis('fechado', false, false, true)).toEqual(['em_andamento'])
    expect(statusDisponiveis('cancelado', false, false, true)).toEqual(['aberto'])
  })
  it('nunca oferece o status atual', () => {
    for (const s of ['aberto', 'em_andamento', 'resolvido'] as const) {
      expect(statusDisponiveis(s, true, true, true)).not.toContain(s)
    }
  })
})

describe('coluna do bloco acompanha a fase', () => {
  const col = (id: string, posicao: number): QuadroColuna => ({ id, nome: id, posicao } as QuadroColuna)
  const tres = [col('feito', 2), col('afazer', 0), col('fazendo', 1)]
  it('aberto → primeira, andamento/aguardando → meio, resolvido/fechado → última', () => {
    expect(colunaDoStatus('aberto', tres)).toBe('afazer')
    expect(colunaDoStatus('em_andamento', tres)).toBe('fazendo')
    expect(colunaDoStatus('aguardando_interno', tres)).toBe('fazendo')
    expect(colunaDoStatus('resolvido', tres)).toBe('feito')
    expect(colunaDoStatus('fechado', tres)).toBe('feito')
  })
  it('bloco com uma coluna só / sem colunas', () => {
    expect(colunaDoStatus('em_andamento', [col('unica', 0)])).toBe('unica')
    expect(colunaDoStatus('resolvido', [])).toBeNull()
  })
})
