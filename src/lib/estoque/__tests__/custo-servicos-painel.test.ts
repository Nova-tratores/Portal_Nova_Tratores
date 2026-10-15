import { describe, it, expect } from 'vitest';
import { custoPorMesDoGrafico, somarCusto, chaveMes } from '../custo-servicos-painel';

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
});
