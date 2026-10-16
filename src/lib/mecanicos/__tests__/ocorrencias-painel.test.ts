import { describe, it, expect } from 'vitest'
import { aindaVale, paraOcorrencia, escudos, motivos, faixa, limitesMes, mesesAte, casarNome, nomeInvalido } from '../ocorrencias-painel'

const pad = (n: unknown) => String(n ?? '').trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())

const linha = (id: number, tec: string, pontos: number, justs: Record<string, unknown>[] = [], extra: Record<string, unknown> = {}) =>
  paraOcorrencia({ id, tecnico_nome: tec, categoria: 'frota', subcategoria: 'excesso_velocidade', pontos_descontados: pontos, data: '2026-10-09', tecnico_justificativas: justs, ...extra }, pad)

describe('ocorrências do pós-vendas', () => {
  it('só deixa de valer com defesa aceita sem desconto', () => {
    expect(aindaVale([])).toBe(true)
    expect(aindaVale([{ status: 'pendente', descontar: null }])).toBe(true)
    expect(aindaVale([{ status: 'recusada', descontar: true }])).toBe(true)
    expect(aindaVale([{ status: 'aprovada', descontar: false }])).toBe(false)
  })

  it('padroniza nome, rótulo do catálogo e categoria desconhecida vira legado', () => {
    const o = linha(1, 'GABRIEL GOMES', 6)
    expect(o.tecnico).toBe('Gabriel Gomes')
    expect(o.rotulo).toBe('Excesso de velocidade')
    expect(linha(2, 'x', 1, [], { categoria: 'qualquer', tipo: 'atraso' }).categoria).toBe('legado')
  })

  it('escudo: 100 menos o que vale, anuladas à parte, todos os técnicos aparecem', () => {
    const ocs = [
      linha(1, 'Ana', 6),
      linha(2, 'Ana', 8, [{ id: 9, status: 'aprovada', descontar_comissao: false }]),
      linha(3, 'Ana', 5, [{ id: 10, status: 'pendente' }]),
      ...Array.from({ length: 20 }, (_, i) => linha(10 + i, 'Bia', 10)),
    ]
    const e = escudos(ocs, ['Ana', 'Bia', 'Caio'])
    const ana = e.find((l) => l.tecnico === 'Ana')!
    expect(ana).toMatchObject({ saldo: 89, descontado: 11, anulado: 8, qtd: 3, pendentes: 1 })
    expect(e.find((l) => l.tecnico === 'Bia')!.saldo).toBe(0)
    expect(e.find((l) => l.tecnico === 'Caio')!.saldo).toBe(100)
    expect(e[0].tecnico).toBe('Bia')
    expect(motivos(ocs)[0]).toMatchObject({ rotulo: 'Excesso de velocidade', qtd: 22 })
  })

  it('junta grafias da mesma pessoa e não chuta quando há dúvida', () => {
    const cad = ['Dougras Mogrs de Jesus Bonfim', 'Danilo Correa', 'Danilo de Souza', 'Lucas', 'José Oliveira']
    expect(casarNome('DOUGRAS BOMFIM', cad)).toBe('Dougras Mogrs de Jesus Bonfim')
    expect(casarNome('Lucas Jose Bragança Enz', cad)).toBe('Lucas')
    expect(casarNome('JOSE ANTONIO DE OLIVEIRA', cad)).toBe('José Oliveira')
    expect(casarNome('Danilo', cad)).toBeNull()
    expect(casarNome('Gabriel Gomes', cad)).toBeNull()
    expect(nomeInvalido('Vazio')).toBe(true)
  })

  it('faixas e datas', () => {
    expect([faixa(100), faixa(79), faixa(49)]).toEqual(['ok', 'atencao', 'critico'])
    expect(limitesMes('2026-02')).toEqual(['2026-02-01', '2026-02-28'])
    expect(mesesAte('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
})

describe('antigas × atuais', () => {
  it('conta por mês e compara com a média dos meses anteriores', async () => {
    const { historicoPorPessoa } = await import('../ocorrencias-painel')
    const m = (id: number, data: string, pts: number, anulada = false) =>
      paraOcorrencia({ id, tecnico_nome: 'Ana', categoria: 'os', subcategoria: 'retorno_servico', pontos_descontados: pts, data, tecnico_justificativas: anulada ? [{ id, status: 'aprovada', descontar_comissao: false }] : [] }, pad)
    const h = historicoPorPessoa([m(1, '2026-08-03', 6), m(2, '2026-08-20', 4), m(3, '2026-09-01', 8, true), m(4, '2026-10-02', 3)], ['2026-08', '2026-09', '2026-10'], ['Ana', 'Bia'])
    const ana = h.find((x) => x.tecnico === 'Ana')!
    expect(ana.qtd).toEqual([2, 1, 1])
    expect(ana.pontos).toEqual([10, 0, 3])
    expect(ana.mediaQtdAntes).toBe(1.5)
    expect(ana.mediaPontosAntes).toBe(5)
    expect(h.find((x) => x.tecnico === 'Bia')!.qtd).toEqual([0, 0, 0])
  })
})
