import { describe, expect, it } from 'vitest'
import { filtroBuscaProdutos, palavrasBusca, semAcento } from '../busca-produtos'

describe('busca de produtos (peças em estoque)', () => {
  it('limpa acento e caracteres que quebram o filtro', () => {
    expect(semAcento('Óleo hidráulico')).toBe('Oleo hidraulico')
    expect(palavrasBusca('  anel, retentor (interno) ')).toEqual(['anel', 'retentor', 'interno'])
    expect(palavrasBusca('2733317/1')).toEqual(['2733317/1'])
    expect(palavrasBusca('')).toEqual([])
  })

  it('cada palavra no código OU na descrição, todas obrigatórias', () => {
    const f = decodeURIComponent(filtroBuscaProdutos('filtro óleo'))
    expect(f).toBe('and=(or(codigo.ilike.*filtro*,descricao.ilike.*filtro*),or(codigo.ilike.*oleo*,descricao.ilike.*oleo*))')
    expect(filtroBuscaProdutos('   ')).toBe('')
  })

  it('o parâmetro vai codificado (nada de % cru na URL)', () => {
    const f = filtroBuscaProdutos('rolamento 6205')
    expect(f).not.toMatch(/%(?![0-9A-F]{2})/i)
    expect(f).toContain('%2C') // vírgulas do filtro codificadas
  })
})
