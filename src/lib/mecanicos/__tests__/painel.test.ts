import { describe, expect, it } from 'vitest'
import { custoEquipe, faltasCartao, resumirGastos, resumoNotas } from '../painel'
import { agregar, diasUteis, pesosPorOS, segundaDa, ultimasSemanas, ultimosMeses, SEM_TECNICO, type DiaRegistrado, type OSFaturada } from '../painel'

const os = (p: Partial<OSFaturada>): OSFaturada => ({
  os: 'OS-1', numeroOmie: '1', cliente: 'C', data: '2026-10-13', em: null, tecnicos: ['Ana'], horasCobradas: 4, km: 100,
  servico: 800, kmValor: 360, pecas: 500, outros: 0, bruto: 1660, custo: 200, ...p,
})

describe('painel do pós-vendas', () => {
  it('semana = segunda a sexta (40 h)', () => {
    expect(segundaDa('2026-10-16')).toBe('2026-10-12')
    expect(segundaDa('2026-10-18')).toBe('2026-10-12') // domingo
    expect(diasUteis('2026-10-12', '2026-10-18')).toBe(5)
    expect(ultimasSemanas('2026-10-16', 2)).toEqual([
      { rotulo: '05/10', de: '2026-10-05', ate: '2026-10-11' },
      { rotulo: '12/10', de: '2026-10-12', ate: '2026-10-18' },
    ])
    expect(ultimosMeses('2026-01-10', 2).map((b) => b.rotulo)).toEqual(['dez/25', 'jan/26'])
  })

  it('horas: internas, cliente, extras (sábado) e ociosas contra 40 h', () => {
    const dias: DiaRegistrado[] = [
      { os: 'OS-1', data: '2026-10-13', tecnico: 'Ana', horas: 6, interna: false },
      { os: 'OS-2', data: '2026-10-14', tecnico: 'Ana', horas: 10, interna: true },
      { os: 'OS-3', data: '2026-10-17', tecnico: 'Ana', horas: 4, interna: false }, // sábado
    ]
    const { linhas } = agregar('2026-10-12', '2026-10-16', ['Ana', 'Bia'], dias, [os({})])
    const ana = linhas.find((l) => l.tecnico === 'Ana')!
    expect(ana).toMatchObject({ trabalhadas: 16, cliente: 6, internas: 10, extras: 0, faturadas: 4, meta: 40, ociosas: 26 })
    expect(ana).toMatchObject({ bruto: 1660, custo: 200, liquido: 1460, servico: 800, kmValor: 360, pecas: 500, km: 100, os: 1 })
    const bia = linhas.find((l) => l.tecnico === 'Bia')!
    expect(bia).toMatchObject({ trabalhadas: 0, ociosas: 40, bruto: 0 }) // aparece zerada
  })

  it('OS com 2 técnicos: valor e km meio a meio; horas cobradas pelo registrado', () => {
    const dias: DiaRegistrado[] = [
      { os: 'OS-1', data: '2026-10-13', tecnico: 'Ana', horas: 3, interna: false },
      { os: 'OS-1', data: '2026-10-13', tecnico: 'Bia', horas: 1, interna: false },
    ]
    const { linhas, total } = agregar('2026-10-12', '2026-10-16', [], dias, [os({ tecnicos: ['Ana', 'Bia'] })], pesosPorOS(dias))
    const ana = linhas.find((l) => l.tecnico === 'Ana')!, bia = linhas.find((l) => l.tecnico === 'Bia')!
    expect(ana.faturadas).toBe(3); expect(bia.faturadas).toBe(1)
    expect(ana.bruto).toBe(830); expect(bia.km).toBe(50)
    expect(total.bruto).toBe(1660); expect(total.meta).toBe(80)
  })

  it('OS sem técnico vai para "Sem técnico" e fica fora da meta', () => {
    const { linhas, total } = agregar('2026-10-12', '2026-10-16', ['Ana'], [], [os({ tecnicos: [] })])
    expect(linhas.find((l) => l.tecnico === SEM_TECNICO)).toMatchObject({ bruto: 1660, ociosas: 0, meta: 0 })
    expect(total.meta).toBe(40) // só a Ana tem meta
  })
})

describe('escalas dia/semana/mês/ano', () => {
  it('períodos e andar', async () => {
    const { periodos, andarPeriodo } = await import('../painel')
    expect(periodos('dia', '2026-10-16', 2)).toEqual([{ rotulo: '15/10', de: '2026-10-15', ate: '2026-10-15' }, { rotulo: '16/10', de: '2026-10-16', ate: '2026-10-16' }])
    expect(periodos('ano', '2026-10-16', 1)).toEqual([{ rotulo: '2026', de: '2026-01-01', ate: '2026-12-31' }])
    expect(andarPeriodo('mes', '2026-01-31', -1)).toBe('2025-12-15')
    expect(andarPeriodo('ano', '2026-10-16', -1)).toBe('2025-10-15')
    expect(andarPeriodo('semana', '2026-10-16', 1)).toBe('2026-10-23')
  })
})

describe('OS interna', () => {
  it('portal, conta corrente ou contrato interno; -pgo não', async () => {
    const { motivoInterna } = await import('../painel')
    const cod = ['Interno', 'Entrega Tecnica', 'Mahindra-pgo']
    expect(motivoInterna({ servicoInterno: true }, 99, cod)).toBe('tipo de serviço interno')
    expect(motivoInterna({ conta: '99' }, 99, cod)).toBe('conta corrente interna')
    expect(motivoInterna({ contratos: ['', 'entrega técnica'] }, 99, cod)).toBe('contrato entrega técnica')
    expect(motivoInterna({ contratos: ['Mahindra-pgo'] }, 99, cod)).toBeNull()
    expect(motivoInterna({ conta: 1, contratos: [null] }, 99, cod)).toBeNull()
  })
})

describe('montarPainel (na tela)', () => {
  it('período em andamento: meta só até hoje; internas listadas', async () => {
    const { montarPainel } = await import('../painel')
    const base = {
      tecnicos: ['Ana'],
      faturadas: [os({ data: '2026-10-13', tecnicos: ['Ana'] })],
      diasTodos: [{ os: 'OS-9', data: '2026-10-14', tecnico: 'Ana', horas: 3, interna: true }],
      osInternas: { 'OS-9': { cliente: 'Loja', motivo: 'contrato Interno' } },
    }
    const p = montarPainel(base, 'semana', '2026-10-14', '2026-10-14')
    expect(p.total.meta).toBe(24) // seg a qua = 3 dias úteis
    expect(p.linhas[0]).toMatchObject({ tecnico: 'Ana', faturadas: 4, internas: 3, ociosas: 17 })
    expect(p.internas).toEqual([{ os: 'OS-9', cliente: 'Loja', motivo: 'contrato Interno', horas: 3, tecnicos: ['Ana'] }])
    expect(p.serie).toHaveLength(8)
  })
})

describe('gastos do pós-vendas', () => {
  it('soma por tipo e pessoa; o que está na OS fica marcado', async () => {
    const { resumirGastos } = await import('../painel')
    const g = [
      { data: '2026-10-13', pessoa: 'Ana', tipo: 'abastecimento' as const, origem: 'cartao' as const, valor: 100, litros: 20, naOS: false },
      { data: '2026-10-14', pessoa: 'Ana', tipo: 'alimentacao' as const, origem: 'requisicao' as const, valor: 50, litros: 0, naOS: true },
      { data: '2026-10-14', pessoa: 'Bia', tipo: 'alimentacao' as const, origem: 'requisicao' as const, valor: 40, litros: 0, naOS: false },
      { data: '2026-09-30', pessoa: 'Bia', tipo: 'abastecimento' as const, origem: 'cartao' as const, valor: 999, litros: 1, naOS: false },
    ]
    const r = resumirGastos(g, '2026-10-01', '2026-10-31')
    expect(r).toMatchObject({ abastecimento: 100, alimentacao: 90, total: 190, litros: 20, foraDasOS: 140 })
    expect(r.porPessoa[0]).toEqual({ pessoa: 'Ana', abastecimento: 100, manutencao: 0, alimentacao: 50, materiais: 0, total: 150, litros: 20, foraDasOS: 100 })
  })
})

describe('custo de terceiros', () => {
  it('só Trator-Cliente não cobrada, sem alimentação/abastecimento', async () => {
    const { ehCustoTerceiro } = await import('../painel')
    expect(ehCustoTerceiro({ setor: 'Trator-Cliente', tipo: 'Serviço de Terceiros', status: 'financeiro', valor_cobrado_cliente: null })).toBe(true)
    expect(ehCustoTerceiro({ setor: 'Trator-Cliente', tipo: 'Peças', status: 'aguardando', valor_cobrado_cliente: '0,00' })).toBe(true)
    expect(ehCustoTerceiro({ setor: 'Trator-Cliente', tipo: 'Peças', status: 'financeiro', valor_cobrado_cliente: '1.250,00' })).toBe(false)
    expect(ehCustoTerceiro({ setor: 'Trator-Cliente', tipo: 'Alimentação', status: 'pedido' })).toBe(false)
    expect(ehCustoTerceiro({ setor: 'Trator-Cliente', tipo: 'Quadri Abastecimento' })).toBe(false)
    expect(ehCustoTerceiro({ setor: 'Oficina', tipo: 'Peças' })).toBe(false)
    expect(ehCustoTerceiro({ setor: 'Trator-Cliente', tipo: 'Peças', status: 'lixeira' })).toBe(false)
  })
})

describe('custo da equipe', () => {
  it('proporcional aos dias, só entre admissão e demissão', async () => {
    const { custoEquipe } = await import('../painel')
    const eq = [
      { pessoa: 'Ana', salario: 3000, encargos: 0, admissao: '2026-01', demissao: null },
      { pessoa: 'Bia', salario: 2000, encargos: 1000, admissao: '2026-10', demissao: null },
      { pessoa: 'Caio', salario: 3100, encargos: 0, admissao: '2025-01', demissao: '2026-09' },
    ]
    const set = custoEquipe(eq, '2026-09-01', '2026-09-30')
    expect(set.porPessoa).toEqual({ Ana: 3000, Caio: 3100 })
    const semana = custoEquipe(eq, '2026-10-12', '2026-10-18') // 7 de 31 dias
    expect(semana.porPessoa.Ana).toBeCloseTo(3000 * 7 / 31, 1)
    expect(semana.porPessoa.Bia).toBeCloseTo(3000 * 7 / 31, 1)
    expect(semana.porPessoa.Caio).toBeUndefined()
  })

  it('salário fixo: semana conta o mês inteiro, uma vez só (José, 21/10/2026)', async () => {
    const { custoEquipe } = await import('../painel')
    const eq = [{ pessoa: 'Ana', salario: 3000, encargos: 1000, admissao: '2026-01', demissao: null }]
    expect(custoEquipe(eq, '2026-10-12', '2026-10-18', { salarioFixo: true }).porPessoa.Ana).toBe(4000)
    // semana que cruza o mês: só o salário do mês em que termina
    expect(custoEquipe(eq, '2026-09-28', '2026-10-04', { salarioFixo: true }).porPessoa.Ana).toBe(4000)
  })
})

describe('grupos Garantia e Outros', () => {
  it('Vinicius fica com o próprio nome (linha da garantia), José Ortiz vira Outros, sem meta de horas', async () => {
    const { montarPainel } = await import('../painel')
    const base = {
      tecnicos: ['Ana', 'Vinicius Correa'],
      faturadas: [os({ os: 'OS-1', data: '2026-10-13', tecnicos: ['Vinicius Correa'] }), os({ os: 'OS-2', data: '2026-10-13', tecnicos: ['Ana'] })],
      diasTodos: [{ os: 'OS-3', data: '2026-10-14', tecnico: 'José Ortiz', horas: 2, interna: false }],
      osInternas: {},
      gastos: [{ data: '2026-10-14', pessoa: 'Vinicius Correa', tipo: 'alimentacao' as const, origem: 'requisicao' as const, valor: 40, litros: 0, naOS: false }],
      equipe: [{ pessoa: 'Vinicius Correa', salario: 3100, encargos: 0, admissao: '2026-01', demissao: null }],
    }
    const p = montarPainel(base, 'semana', '2026-10-16', '2026-10-16')
    const nomes = p.linhas.map((l) => l.tecnico)
    expect(nomes).toContain('Vinicius Correa'); expect(nomes).toContain('Outros'); expect(nomes).not.toContain('Garantia')
    const gar = p.linhas.find((l) => l.tecnico === 'Vinicius Correa')!
    expect(gar).toMatchObject({ meta: 0, ociosas: 0, bruto: 1660 })
    expect(p.total.meta).toBe(40) // só a Ana tem meta (seg a sex)
    expect(p.gastos.porPessoa[0].pessoa).toBe('Vinicius Correa')
    expect(p.equipe.porPessoa['Vinicius Correa']).toBeGreaterThan(0)
  })
})

describe('só quem estava ativo', () => {
  it('fora das datas do RH não aparece; meta só dos dias ativos', async () => {
    const { montarPainel, ativoEm } = await import('../painel')
    expect(ativoEm({ admissao: '2025-01', demissao: null }, '2024-01-01', '2024-12-31')).toBe(false)
    expect(ativoEm({ admissao: '2024-06', demissao: '2026-09' }, '2026-10-01', '2026-10-31')).toBe(false)
    expect(ativoEm({ admissao: '2024-06', demissao: '2026-09' }, '2026-09-01', '2026-09-30')).toBe(true)
    const base = {
      tecnicos: ['Ana', 'Bia'], faturadas: [], diasTodos: [], osInternas: {},
      equipe: [{ pessoa: 'Bia', salario: 1, encargos: 0, admissao: '2026-10', demissao: null }],
    }
    const set = montarPainel(base, 'mes', '2026-09-15', '2026-10-16')
    expect(set.linhas.map((l) => l.tecnico)).toEqual(['Ana']) // Bia entrou em outubro
    const ano = montarPainel(base, 'ano', '2026-10-16', '2026-10-16')
    const bia = ano.linhas.find((l) => l.tecnico === 'Bia')!
    expect(bia.meta).toBe(12 * 8) // 01–16/10 = 12 dias úteis
  })
})

describe('despesas completas (RH, comissão, em aberto)', () => {
  it('comissão e rescisão entram no pessoal, mesmo depois da demissão', () => {
    const eq = [{ pessoa: 'Pedro', salario: 1000, encargos: 440, admissao: '2026-01', demissao: '2026-07', extras: [{ mes: '2026-07', comissao: 310, rescisao: 5101 }, { mes: '2026-08', comissao: 0, rescisao: 310 }] }]
    const jul = custoEquipe(eq, '2026-07-01', '2026-07-31')
    expect(jul.salario).toBeCloseTo(1440, 1)
    expect(jul.comissao).toBeCloseTo(310, 1)
    expect(jul.rescisao).toBeCloseTo(5101, 1)
    expect(jul.porPessoa.Pedro).toBeCloseTo(1440 + 310 + 5101, 1)
    const ago = custoEquipe(eq, '2026-08-01', '2026-08-31')
    expect(ago.salario).toBe(0)
    expect(ago.rescisao).toBeCloseTo(310, 1)
    // meio mês = metade
    expect(custoEquipe(eq, '2026-07-01', '2026-07-15').comissao).toBeCloseTo(150, 0)
  })
  it('requisição em aberto fica fora do total', () => {
    const g = resumirGastos([
      { data: '2026-09-02', pessoa: 'A', tipo: 'materiais', origem: 'requisicao', valor: 100, litros: 0, naOS: false },
      { data: '2026-09-03', pessoa: 'A', tipo: 'alimentacao', origem: 'requisicao', valor: 40, litros: 0, naOS: false, aberto: true },
    ], '2026-09-01', '2026-09-30')
    expect(g.total).toBe(100)
    expect(g.materiais).toBe(100)
    expect(g.emAberto).toBe(40)
    expect(g.porPessoa[0].materiais).toBe(100)
  })
  it('separa serviço com nota × recibo', () => {
    const base = { numeroOmie: '1', cliente: '', data: '2026-09-01', em: null, tecnicos: [], horasCobradas: 0, km: 0, pecas: 500, custo: 0 }
    const r = resumoNotas([
      { ...base, os: 'a', servico: 100, kmValor: 50, outros: 10, bruto: 660, nota: true },
      { ...base, os: 'b', servico: 200, kmValor: 0, outros: 0, bruto: 700 },
    ])
    expect(r).toEqual({ comNota: 160, recibo: 200, qtdNota: 1, qtdRecibo: 1 })
  })
})

describe('cartão-frota por planilha', () => {
  const c = (data: string) => ({ data, pessoa: 'A', tipo: 'abastecimento' as const, origem: 'cartao' as const, valor: 10, litros: 1, naOS: false })
  it('avisa os dias depois da última importação e os meses sem nada', () => {
    const g = [c('2025-10-20'), c('2026-01-05'), c('2026-09-14')]
    expect(faltasCartao(g, '2026-09-01', '2026-09-30')).toEqual({ ultimo: '2026-09-14', depoisDe: '2026-09-14', mesesSem: [] })
    expect(faltasCartao(g, '2025-11-01', '2025-12-31').mesesSem).toEqual(['2025-11', '2025-12'])
    expect(faltasCartao(g, '2026-01-01', '2026-01-31')).toEqual({ ultimo: '2026-09-14', depoisDe: null, mesesSem: [] })
  })
})

describe('meta de horas com OS preenchida e não faturada', () => {
  it('horas do app em OS aguardando faturar contam na meta e tiram das ociosas', () => {
    const dias = [
      { os: 'OS-1', data: '2026-10-05', tecnico: 'Ana', horas: 6, interna: false },
      { os: 'OS-2', data: '2026-10-06', tecnico: 'Ana', horas: 4, interna: false },
    ]
    const r = agregar('2026-10-05', '2026-10-09', ['Ana'], dias, [], undefined, undefined, new Set(['OS-1']))
    const ana = r.linhas[0]
    expect(ana.aguardando).toBe(6)
    expect(ana.ociosas).toBe(ana.meta - 6)
    expect(r.total.aguardando).toBe(6)
  })
})
