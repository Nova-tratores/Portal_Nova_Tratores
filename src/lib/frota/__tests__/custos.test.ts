import { describe, it, expect } from 'vitest';
import { montarTco, custoPorKm, parseHodometro, type VeiculoTco, type EntradaTco } from '../custos';

const v = (over: Partial<VeiculoTco>): VeiculoTco => ({
  id: 'v1', placa: 'GAL7A16', modelo: 'CARGO', descricao: null, marca: 'FORD',
  tem_rastreador: true, tipo_registro: 'veiculo', ativo: true, status: 'ativo',
  supa_placa_id: 111, categoria: 'oficina', ...over,
});

const base = (over: Partial<EntradaTco> = {}): EntradaTco => ({
  veiculos: [v({})], custos: [], dias: [], hodAbastecimentos: [], hodRequisicoes: [], ...over,
});

describe('montarTco', () => {
  it('separa os custos por balde e soma o total', () => {
    const [l] = montarTco(base({
      custos: [
        { veiculo_id: 'v1', data: '2026-09-01', tipo: 'Combustível', valor: 300, fonte: 'abastecimentos' },
        { veiculo_id: 'v1', data: '2026-09-02', tipo: 'Manutenção', valor: 200, fonte: 'requisicao' },
        { veiculo_id: 'v1', data: '2026-09-03', tipo: 'Multa', valor: 100, fonte: 'multa' },
        { veiculo_id: 'v1', data: '2026-09-04', tipo: 'Despesa de frota', valor: 50, fonte: 'requisicao' },
      ],
    }));
    expect(l).toMatchObject({ combustivel: 300, manutencao: 200, multas: 100, outros: 50, total: 650 });
  });

  it('km do rastreador tem prioridade sobre o hodômetro digitado', () => {
    const [l] = montarTco(base({
      custos: [{ veiculo_id: 'v1', data: '2026-09-01', tipo: 'Combustível', valor: 10, fonte: null }],
      dias: [{ veiculo_id: 'v1', km_total: 90, km_odometro: 100 }, { veiculo_id: 'v1', km_total: 50, km_odometro: null }],
      hodAbastecimentos: [{ placa: 'GAL7A16', hodometro: '10.000' }, { placa: 'GAL7A16', hodometro: '19.000' }],
    }));
    expect(l.km).toBe(150);
    expect(l.km_fonte).toBe('rastreador');
  });

  it('sem rastreador: km = delta do hodômetro digitado (cartão + requisição por supa_placa_id)', () => {
    const [l] = montarTco(base({
      veiculos: [v({ tem_rastreador: false })],
      custos: [{ veiculo_id: 'v1', data: '2026-09-01', tipo: 'Combustível', valor: 10, fonte: null }],
      hodAbastecimentos: [{ placa: 'GAL-7A16', hodometro: '353.602' }],
      hodRequisicoes: [{ veiculo: 111, hodometro: '354602' }],
    }));
    expect(l.km).toBe(1000);
    expect(l.km_fonte).toBe('digitado');
  });

  it('delta absurdo de hodômetro (erro de digitação) não vira km', () => {
    const [l] = montarTco(base({
      custos: [{ veiculo_id: 'v1', data: '2026-09-01', tipo: 'Combustível', valor: 10, fonte: null }],
      hodAbastecimentos: [{ placa: 'GAL7A16', hodometro: '1000' }, { placa: 'GAL7A16', hodometro: '900000' }],
    }));
    expect(l.km).toBe(0);
  });

  it('veículo sem custo e sem km fica fora; ordena por total', () => {
    const ls = montarTco(base({
      veiculos: [v({}), v({ id: 'v2', placa: 'TKB8I49' }), v({ id: 'v3', placa: 'SEB9J47' })],
      custos: [
        { veiculo_id: 'v1', data: '2026-09-01', tipo: 'Combustível', valor: 10, fonte: null },
        { veiculo_id: 'v2', data: '2026-09-01', tipo: 'Combustível', valor: 90, fonte: null },
      ],
    }));
    expect(ls.map((l) => l.placa)).toEqual(['TKB8I49', 'GAL7A16']);
  });
});

describe('custoPorKm e parseHodometro', () => {
  it('R$/km só com pelo menos 50 km', () => {
    expect(custoPorKm({ total: 100, km: 49 })).toBeNull();
    expect(custoPorKm({ total: 100, km: 50 })).toBe(2);
  });
  it('hodômetro: só dígitos, faixa plausível', () => {
    expect(parseHodometro('353.602')).toBe(353602);
    expect(parseHodometro('50')).toBeNull();
    expect(parseHodometro(null)).toBeNull();
  });
});
