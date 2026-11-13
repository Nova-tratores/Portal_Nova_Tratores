import { describe, expect, it } from 'vitest'
import { montarDreGerencial, setorPorCategoria, setorPorDepartamento, semIntercompany } from '../dre-gerencial'

const L = (o: Record<string, unknown>) => ({ dreTipo: '1. Lucro Bruto', ...o }) as never

describe('DRE gerencial por setor', () => {
  it('setor pelo departamento e pela categoria', () => {
    expect(setorPorDepartamento('08. Comercial Peças')).toBe('pecas')
    expect(setorPorDepartamento('06. Comercial Tratores')).toBe('comercial')
    expect(setorPorDepartamento('04. # Oficina Frota')).toBe('posvendas')
    expect(setorPorDepartamento('05. Administrativo')).toBeNull()
    expect(setorPorCategoria('10. @Revenda de Peças Balcão')).toBe('pecas')
    expect(setorPorCategoria('8. @Revenda de Peças em Serviços Prestados')).toBe('posvendas')
    expect(setorPorCategoria('1. #Serv Prest Manutenção')).toBe('posvendas')
    expect(setorPorCategoria('Venda de Tratores')).toBe('comercial')
  })

  it('tira compras para revenda e principal de empréstimo, e rateia o geral pela receita', () => {
    const d = montarDreGerencial([
      L({ valor: 1000, dreConta: '01. Receita Bruta de Vendas', categoria: 'Venda de Tratores' }),
      L({ valor: -700, dreConta: '01. Custo Médio (CMC) das Vendas', categoria: 'N/D', departamento: '06. Comercial Tratores' }),
      L({ valor: 1000, dreConta: '01. Receita Bruta de Vendas', categoria: '10. @Revenda de Peças Balcão' }),
      L({ valor: -600, dreConta: '01. Custo Médio (CMC) das Vendas', departamento: '08. Comercial Peças' }),
      L({ valor: -900, dreConta: '02. Custo dos Serviços Prestados', categoria: 'Compras de Tratores para Revenda' }),
      { valor: -500, dreTipo: '2. Despesas', dreConta: '03. Despesas Financeiras', categoria: 'Pagamento de Empréstimos' } as never,
      { valor: -200, dreTipo: '2. Despesas', dreConta: '01. Despesas com Pessoal', departamento: 'N/D' } as never,
    ])
    expect(d.ajustes.map((a) => a.id).sort()).toEqual(['compras_revenda', 'emprestimos'])
    expect(d.setores.comercial.margem).toBe(300)
    expect(d.setores.pecas.margem).toBe(400)
    expect(d.setores.comercial.rateio).toBe(-100) // metade da receita → metade dos R$ 200
    expect(d.empresa.resultado).toBe(500)          // 300 + 400 − 200
    expect(d.omie).toBe(-900)                       // o Omie contava a compra e o principal
  })

  it('sem intercompany', () => {
    const l = semIntercompany([{ valor: 1, cnpj_cpf: '23.268.241/0001-11' }, { valor: 2, cnpj_cpf: '1' }] as never, 'nova')
    expect(l).toHaveLength(1)
  })
})

describe('DRE gerencial — casos de outubro/2026', () => {
  it('venda de implemento com departamento de Peças vai para o Comercial, com o CMC da mesma nota', () => {
    const d = montarDreGerencial([
      { dreTipo: '1. Lucro Bruto', valor: 350000, dreConta: '01. Receita Bruta de Vendas', categoria: 'Venda de Implementos', departamento: '08. Comercial Peças', numeroDocFiscal: '00008421' },
      { dreTipo: '1. Lucro Bruto', valor: -300000, dreConta: '01. Custo Médio (CMC) das Vendas', categoria: 'N/D', departamento: '08. Comercial Peças', numeroDocFiscal: '00008421' },
      { dreTipo: '2. Despesas', valor: -10000, dreConta: '03. Despesas Financeiras', categoria: 'Descontos Concedidos*', departamento: '06. Comercial Tratores' },
    ] as never)
    expect(d.setores.comercial.receita).toBe(350000)
    expect(d.setores.comercial.custos).toBe(-300000)
    expect(d.setores.comercial.deducoes).toBe(-10000)
    expect(d.setores.pecas.receita).toBe(0)
  })
})
