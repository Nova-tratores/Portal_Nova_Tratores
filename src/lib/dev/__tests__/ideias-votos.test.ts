import { describe, it, expect } from 'vitest'
import { ordenarPorVotos, parecidos, palavrasChave, type Ideia } from '../ideias'

const ideia = (id: string, created_at: string): Ideia => ({ id, texto: id, autor_id: 'u', grupo_id: null, posicao: 0, arquivada: false, created_at, updated_at: created_at })

describe('votos (melhorias 5.2)', () => {
  it('mais votada primeiro; empate = mais nova primeiro', () => {
    const l = [ideia('a', '2026-11-01T10:00:00Z'), ideia('b', '2026-11-20T10:00:00Z'), ideia('c', '2026-11-10T10:00:00Z')]
    expect(ordenarPorVotos(l, { c: ['x', 'y'], a: ['x'] }).map((i) => i.id)).toEqual(['c', 'a', 'b'])
    expect(ordenarPorVotos(l, {}).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('parecido com pedido aberto (melhorias 5.3)', () => {
  const pedidos = [
    { id: '10', numero: 10, titulo: 'Sistema para Produtos Internos' },
    { id: '20', numero: 20, titulo: 'Trocar impressora da recepção' },
    { id: '30', numero: 30, titulo: 'Relatório de custos das máquinas' },
  ]
  it('acha o #10 pela ideia sobre produtos internos', () => {
    const r = parecidos('Ter um cadastro de produtos internos com estoque e preço', pedidos)
    expect(r.map((x) => x.numero)).toEqual([10])
    expect(r[0].comuns.sort()).toEqual(['interno', 'produto'])
  })
  it('acentos e plural não atrapalham', () => {
    expect(parecidos('relatorio mensal do custo de cada maquina', pedidos).map((x) => x.numero)).toEqual([30])
    expect(palavrasChave('Máquinas e RELATÓRIOS').has('maquina')).toBe(true)
  })
  it('uma palavra só em comum não é parecido', () => {
    expect(parecidos('comprar uma impressora nova para o galpão', pedidos)).toEqual([])
  })
})
