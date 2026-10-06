import { describe, it, expect } from 'vitest'
import {
  podeVerQuadro, podeTrabalhar, podeGerenciar, validarQuadro,
  destinoAoRemover, ordemValida, colunaDoTicket, ordenarColunas, type QuadroColuna,
} from '../quadros'

const q = { visibilidade: 'privado' as const, criado_por: 'dono', arquivado: false }
const col = (id: string, posicao: number): QuadroColuna => ({ id, quadro_id: 'q', nome: id, posicao })

describe('papéis do quadro', () => {
  it('privado: só integrante, criador e admin veem', () => {
    expect(podeVerQuadro(q, ['m1'], { userId: 'm1', isAdmin: false })).toBe(true)
    expect(podeVerQuadro(q, ['m1'], { userId: 'dono', isAdmin: false })).toBe(true)
    expect(podeVerQuadro(q, ['m1'], { userId: 'x', isAdmin: true })).toBe(true)
    expect(podeVerQuadro(q, ['m1'], { userId: 'x', isAdmin: false })).toBe(false)
  })
  it('público: todos veem, mas só integrante trabalha', () => {
    const pub = { ...q, visibilidade: 'publico' as const }
    expect(podeVerQuadro(pub, [], { userId: 'x', isAdmin: false })).toBe(true)
    expect(podeTrabalhar(pub, [], { userId: 'x', isAdmin: false })).toBe(false)
    expect(podeTrabalhar(pub, ['x'], { userId: 'x', isAdmin: false })).toBe(true)
  })
  it('arquivado não aceita trabalho; só criador/admin gerencia', () => {
    expect(podeTrabalhar({ ...q, arquivado: true }, ['m1'], { userId: 'm1', isAdmin: false })).toBe(false)
    expect(podeGerenciar(q, { userId: 'm1', isAdmin: false })).toBe(false)
    expect(podeGerenciar(q, { userId: 'dono', isAdmin: false })).toBe(true)
  })
})

describe('validarQuadro', () => {
  it('exige nome ao criar e normaliza', () => {
    expect(validarQuadro({ nome: '  ' }, true)).toEqual({ ok: false, erro: 'Dê um nome ao quadro.' })
    const v = validarQuadro({ nome: ' Obra   do galpão ', cor: '#ABCDEF', visibilidade: 'publico' }, true)
    expect(v).toEqual({ ok: true, campos: { nome: 'Obra do galpão', cor: '#abcdef', visibilidade: 'publico' } })
  })
  it('recusa cor inválida e só mexe no que veio', () => {
    expect(validarQuadro({ cor: 'red' }, false)).toEqual({ ok: false, erro: 'Cor inválida.' })
    expect(validarQuadro({ descricao: 'x' }, false)).toEqual({ ok: true, campos: { descricao: 'x' } })
  })
})

describe('colunas', () => {
  const cols = [col('c', 2), col('a', 0), col('b', 1)]
  it('ordena por posição', () => {
    expect(ordenarColunas(cols).map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })
  it('remover manda os tickets para a escolhida ou a primeira restante', () => {
    expect(destinoAoRemover(cols, 'a')).toBe('b')
    expect(destinoAoRemover(cols, 'a', 'c')).toBe('c')
    expect(destinoAoRemover(cols, 'a', 'a')).toBe('b')
    expect(destinoAoRemover([col('a', 0)], 'a')).toBeNull()
  })
  it('nova ordem precisa ter exatamente as mesmas colunas', () => {
    expect(ordemValida(cols, ['c', 'b', 'a'])).toEqual(['c', 'b', 'a'])
    expect(ordemValida(cols, ['a', 'b'])).toBeNull()
    expect(ordemValida(cols, ['a', 'a', 'b'])).toBeNull()
    expect(ordemValida(cols, ['a', 'b', 'z'])).toBeNull()
  })
  it('ticket sem coluna válida aparece na primeira', () => {
    expect(colunaDoTicket('b', cols)).toBe('b')
    expect(colunaDoTicket('sumiu', cols)).toBe('a')
    expect(colunaDoTicket(null, [])).toBeNull()
  })
})
