import { describe, expect, it } from 'vitest'
import { autorizacoesDe, chaveAbastecimento, diferencasEntre, separarPorAutorizacao } from '../dedup'

const l = (autorizacao: string | null | undefined, id: number) => ({ autorizacao, id })

describe('proteção por autorização da operadora', () => {
  it('linha com autorização já no banco é pulada', () => {
    // o cenário do furo: reexport do CSV com litros corrigidos — a chave
    // placa+data+litros muda, mas a autorização denuncia a mesma transação
    const r = separarPorAutorizacao([l('AUT-1', 1), l('AUT-2', 2)], ['AUT-1'])
    expect(r.aceitas.map((x) => x.id)).toEqual([2])
    expect(r.puladas.map((x) => x.id)).toEqual([1])
  })

  it('autorização repetida DENTRO do próprio arquivo: só a primeira entra', () => {
    const r = separarPorAutorizacao([l('AUT-9', 1), l('AUT-9', 2), l('AUT-9', 3)], [])
    expect(r.aceitas.map((x) => x.id)).toEqual([1])
    expect(r.puladas.map((x) => x.id)).toEqual([2, 3])
  })

  it('linha SEM autorização nunca é pulada aqui — a chave do banco cuida dela', () => {
    // ~44% do histórico veio sem o código; pular essas seria perder dado real
    const r = separarPorAutorizacao([l('', 1), l(null, 2), l(undefined, 3), l('  ', 4)], ['QUALQUER'])
    expect(r.aceitas.map((x) => x.id)).toEqual([1, 2, 3, 4])
    expect(r.puladas).toEqual([])
  })

  it('espaços em volta não enganam a comparação', () => {
    const r = separarPorAutorizacao([l(' AUT-7 ', 1)], ['AUT-7'])
    expect(r.puladas.map((x) => x.id)).toEqual([1])
  })

  it('a soma aceitas+puladas é o total — nenhuma linha some da conta', () => {
    const linhas = [l('A', 1), l('B', 2), l('A', 3), l('', 4), l('C', 5)]
    const r = separarPorAutorizacao(linhas, ['C'])
    expect(r.aceitas.length + r.puladas.length).toBe(linhas.length)
    expect(r.aceitas.map((x) => x.id)).toEqual([1, 2, 4])
    expect(r.puladas.map((x) => x.id)).toEqual([3, 5])
  })

  it('autorizacoesDe devolve só as não-vazias, sem repetir', () => {
    expect(autorizacoesDe([l('A', 1), l('A', 2), l('', 3), l(null, 4), l(' B ', 5)])).toEqual(['A', 'B'])
    expect(autorizacoesDe([])).toEqual([])
  })
})

describe('detalhamento das duplicadas', () => {
  it('a chave normaliza litros por VALOR — 45.5 e 45.500 são a mesma linha', () => {
    const a = chaveAbastecimento({ placa: 'ABC1D23', data_transacao: '2026-09-01T08:00:00-03:00', litros: 45.5 })
    const b = chaveAbastecimento({ placa: 'abc1d23 ', data_transacao: '2026-09-01T08:00:00-03:00', litros: '45.500' })
    expect(a).toBe(b)
  })

  it('linhas iguais no que importa não têm diferença (nada a substituir)', () => {
    const e = { data_transacao: 'X', litros: 45.5, valor_total: 250, combustivel: 'Diesel', posto_nome: 'Posto A' }
    const l = { data_transacao: 'X', litros: '45.50', valor_total: '250.00', combustivel: 'Diesel ', posto_nome: 'Posto A' }
    expect(diferencasEntre(e, l)).toEqual([])
  })

  it('a correção da operadora aparece campo a campo, com de → para', () => {
    const e = { data_transacao: 'X', litros: 45.5, valor_total: 250 }
    const l = { data_transacao: 'X', litros: 47.2, valor_total: 259.4 }
    const difs = diferencasEntre(e, l)
    expect(difs.map((d) => d.campo)).toEqual(['litros', 'valor_total'])
    expect(difs[0]).toMatchObject({ rotulo: 'Litros', de: '45.5', para: '47.2' })
  })

  it('nulo dos dois lados não vira diferença; nulo de um lado vira', () => {
    expect(diferencasEntre({ hodometro: null }, { hodometro: null })).toEqual([])
    const difs = diferencasEntre({ hodometro: null }, { hodometro: 123456 })
    expect(difs.map((d) => d.campo)).toEqual(['hodometro'])
  })
})
