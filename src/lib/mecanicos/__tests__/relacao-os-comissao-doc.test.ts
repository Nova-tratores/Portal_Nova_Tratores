import { describe, it, expect } from 'vitest'
import { htmlRelacaoOS, totaisRelacao, decisaoRelacao, type DocRelacaoOS, type LinhaRelacao } from '../relacao-os-comissao-doc'

const lin = (x: Partial<LinhaRelacao>): LinhaRelacao => ({ numero: '100', data: '2026-10-05', cliente: 'JOAO DA SILVA', valorOS: 1000, pecas: 200, descontoCliente: 0, horas: 4, base: 800, calculado: 80, final: 80, acao: 'pagar', ...x })

const doc = (x: Partial<DocRelacaoOS> = {}): DocRelacaoOS => ({
  tecnico: 'Gabriel Moraes', mes: '2026-10', regra: '10% sobre as horas', emitidoEm: '2026-11-05T12:00:00Z', logo: '/Logo_Nova.png',
  situacao: { tipo: 'previa', texto: 'Prévia' },
  grupos: [
    { k: 'cliente', rot: 'Faturadas para clientes', linhas: [lin({}), lin({ numero: '101', calculado: 50, final: 0, acao: 'nao', motivo: 'Retorno de serviço' })] },
    { k: 'garantia', rot: 'Garantia', linhas: [lin({ numero: '102', valorOS: null, base: 300, calculado: 30, final: 30 })] },
    { k: 'interna', rot: 'Internas', linhas: [] },
  ],
  aguardando: [{ numero: '200', cliente: 'X', data: null, valor: 40 }],
  descontos: [{ descricao: 'Ferramenta', valor: 30, parcelas: 3 }, { descricao: 'Pela caixinha', valor: 99, caixinha: true }],
  descontosRH: [], caixinha: 0, ...x,
})

describe('relação de OS da comissão', () => {
  it('soma por grupo e total; aguardando fica fora', () => {
    const t = totaisRelacao(doc())
    expect(t.n).toBe(3)
    expect(t.grupos.map((g) => g.k)).toEqual(['cliente', 'garantia'])
    expect(t.grupos[0].final).toBe(80)
    expect(t.valor).toBe(2300) // OS sem valor usa a base
    expect(t.calculado).toBe(160)
    expect(t.final).toBe(110)
    expect(t.aguardando).toBe(40)
    expect(t.naoPagas).toBe(1)
  })
  it('líquido tira só a 1ª parcela e não o que é pela caixinha', () => {
    expect(totaisRelacao(doc()).liquido).toBe(100)
    expect(totaisRelacao(doc({ caixinha: 1.1 })).liquido).toBe(98.9)
  })
  it('decisão em palavras', () => {
    expect(decisaoRelacao(lin({}), 'Gabriel Moraes')).toBe('Pela regra')
    expect(decisaoRelacao(lin({ acao: 'nao', final: 0, motivo: 'Retorno' }), 'Gabriel Moraes')).toBe('Não paga — Retorno')
    expect(decisaoRelacao(lin({ veioDe: { de: 'Danilo', horas: 2, status: 'autorizada' } }), 'Gabriel Moraes')).toContain('Dividida por Danilo (2 h')
    expect(decisaoRelacao(lin({ com: ['Danilo'] }), 'Gabriel Moraes')).toContain('dividida no Omie com Danilo')
  })
  it('risca a comissão só quando mudou e escapa HTML', () => {
    const h = htmlRelacaoOS(doc({ grupos: [{ k: 'cliente', rot: 'Clientes', linhas: [lin({ cliente: '<b>x</b>' }), lin({ numero: '9', final: 10 })] }] }))
    expect(h.match(/<s>/g)?.length).toBe(1)
    expect(h).not.toContain('<b>x</b>')
    expect(h).toContain('A4 landscape')
    expect(h).toContain('Esperando faturar')
  })
})
