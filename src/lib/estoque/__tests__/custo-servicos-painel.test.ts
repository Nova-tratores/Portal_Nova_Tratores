import { describe, it, expect } from 'vitest';
import { custoPorMesDoGrafico, somarCusto, chaveMes, montarDetalheCusto } from '../custo-servicos-painel';

describe('custo de serviços do Painel Omie', () => {
  it('soma os componentes da saída da oficina por mês (régua do dashboard-geral)', () => {
    const m = custoPorMesDoGrafico([
      { mes: '2026-09', comissao: 100, despesaGeral: 50, despesaVeic: 25, custoFixo: 1000, custoRealInterno: 10 },
      { mes: '2026-10', comissao: 1, custoFixo: 2 },
      { mes: 'N/D', comissao: 999 },
    ]);
    expect(m).toEqual({ '2026-09': 1185, '2026-10': 3 });
  });

  it('soma só os meses pedidos', () => {
    const m = { '2026-01': 10, '2026-02': 20, '2025-02': 5 };
    expect(somarCusto(m, [{ mes: 2, ano: 2026 }, { mes: 3, ano: 2026 }])).toBe(20);
    expect(chaveMes(2, 2025)).toBe('2025-02');
  });

  it('detalhe do mês: componentes, despesas contadas e só as internas reais do mês', () => {
    const d = montarDetalheCusto({
      grafico: [{ mes: '2026-09', comissao: 10, despesaGeral: 20, despesaVeic: 30, custoFixo: 100, custoRealInterno: 5 }],
      listaDespesas: [
        { data: '05/09/2026', descricao: 'Almoço', valor: '1.234,50', _contado: true, _tecnico: 'Gabriel' },
        { data: '06/09/2026', descricao: 'Diesel', valor: 300, veiculo: 'TKC5D99', _contado: true },
        { data: '07/09/2026', descricao: 'Ferramenta', valor: 999, _contado: false },
      ],
      listaOS: [
        { numero_os_join: '0777', nome_cliente_join: 'Fulano', data_emissao_join: '2026-09-10', _internoSub: 'REAL', custo_real: { total: 5 }, tipo_calculado: 'INTERNO' },
        { numero_os_join: '0778', data_emissao_join: '2026-08-30', _internoSub: 'REAL', custo_real: { total: 9 } },
        { numero_os_join: '0779', data_emissao_join: '2026-09-11', _internoSub: 'RECEBER', custo_real: { total: 9 } },
      ],
    }, '2026-09');
    expect(d.componentes.total).toBe(165);
    expect(d.despesas.map((x) => [x.descricao, x.valor, x.tipo])).toEqual([['Almoço', 1234.5, 'geral'], ['Diesel', 300, 'veiculo']]);
    expect(d.internas.map((x) => x.numero)).toEqual(['0777']);
  });
});
