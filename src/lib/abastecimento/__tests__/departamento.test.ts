import { describe, expect, it } from 'vitest'
import { SEM_DEPTO, SEM_MOTORISTA, agruparPorDepartamento } from '../departamento'
import type { TransacaoRow } from '../tipos'

let seq = 1
const t = (over: Partial<TransacaoRow>): TransacaoRow => ({
  id: seq++,
  data_transacao: '2026-08-10T10:00:00-03:00',
  placa: 'AAA1A11',
  modelo_veiculo: null,
  departamento: 'COMERCIAL',
  filial_nome: null,
  motorista_nome: 'Fulano',
  posto_nome: null,
  combustivel: null,
  litros: 10,
  valor_unitario: null,
  valor_total: 100,
  hodometro: null,
  ordem_servico: null,
  origem: 'cartao',
  ...over,
})

describe('agruparPorDepartamento', () => {
  it('grafias diferentes do mesmo departamento viram UM grupo', () => {
    // cartão vem MAIÚSCULO do CSV; requisição vem Title Case do setor
    const r = agruparPorDepartamento([
      t({ departamento: 'COMERCIAL', valor_total: 50 }),
      t({ departamento: 'Comercial', valor_total: 30, origem: 'requisicao', req_id: 9 }),
    ])
    expect(r.departamentos).toHaveLength(1)
    expect(r.departamentos[0].departamento).toBe('Comercial')
    expect(r.departamentos[0].total).toBe(80)
  })

  it('linhas do motorista ficam em ordem crescente de data (a API manda desc)', () => {
    const r = agruparPorDepartamento([
      t({ data_transacao: '2026-08-21T08:00:00-03:00', valor_total: 3 }),
      t({ data_transacao: '2026-08-04T08:00:00-03:00', valor_total: 1 }),
      t({ data_transacao: '2026-08-12T08:00:00-03:00', valor_total: 2 }),
    ])
    const linhas = r.departamentos[0].placas[0].motoristas[0].linhas
    expect(linhas.map((l) => l.valor)).toEqual([1, 2, 3])
  })

  it('separa Cartão × Requisição e o total geral bate com a soma', () => {
    const r = agruparPorDepartamento([
      t({ departamento: 'OFICINA', valor_total: 100 }),
      t({ departamento: 'OFICINA', valor_total: 40, origem: 'requisicao' }),
      t({ departamento: 'DIRETORIA', valor_total: 10 }),
    ])
    const ofi = r.departamentos.find((d) => d.departamento === 'Oficina')!
    expect(ofi.cartao).toBe(100)
    expect(ofi.requisicao).toBe(40)
    expect(r.totalCartao).toBe(110)
    expect(r.totalRequisicao).toBe(40)
    expect(r.totalGeral).toBe(150)
    // ordem alfabética
    expect(r.departamentos.map((d) => d.departamento)).toEqual(['Diretoria', 'Oficina'])
  })

  it('departamento e motorista vazios caem em "Sem …" e ficam por último', () => {
    const r = agruparPorDepartamento([
      t({ departamento: null, motorista_nome: null, valor_total: 5 }),
      t({ departamento: 'CAMINHÃO', motorista_nome: '  ', valor_total: 7 }),
      t({ departamento: 'CAMINHÃO', motorista_nome: 'Ana', valor_total: 8 }),
    ])
    expect(r.departamentos.map((d) => d.departamento)).toEqual(['Caminhão', SEM_DEPTO])
    const cam = r.departamentos[0]
    expect(cam.placas[0].motoristas.map((m) => m.motorista)).toEqual(['Ana', SEM_MOTORISTA])
    expect(r.departamentos[1].placas[0].motoristas[0].motorista).toBe(SEM_MOTORISTA)
  })

  it('total por motorista soma entre placas do mesmo departamento', () => {
    const r = agruparPorDepartamento([
      t({ placa: 'GIH0I50', motorista_nome: 'Nicolas', valor_total: 100 }),
      t({ placa: 'CLI0003', motorista_nome: 'Nicolas', valor_total: 50 }),
      t({ placa: 'CLI0003', motorista_nome: 'Danilo', valor_total: 20 }),
    ])
    expect(r.porMotorista).toHaveLength(1)
    expect(r.porMotorista[0].total).toBe(170)
    expect(r.porMotorista[0].motoristas).toEqual([
      { motorista: 'Danilo', total: 20 },
      { motorista: 'Nicolas', total: 150 },
    ])
    // subtotal por placa também confere
    expect(r.departamentos[0].placas.map((p) => [p.placa, p.total])).toEqual([['CLI0003', 70], ['GIH0I50', 100]])
  })

  it('valor nulo conta como zero', () => {
    const r = agruparPorDepartamento([t({ valor_total: null })])
    expect(r.totalGeral).toBe(0)
  })
})
