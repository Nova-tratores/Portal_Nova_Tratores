import { describe, it, expect } from 'vitest';
import { somenteFrota, resumoCombustivel } from '../uniao';
import type { LinhaDash } from '../agregacoes';

const linha = (placa: string, valor: number, litros: number, origem?: 'requisicao'): LinhaDash => ({
  placa, id_placa: null, modelo_veiculo: null, filial_nome: null, motorista_nome: null,
  posto_nome: null, posto_cidade: null, combustivel: null, litros, valor_total: valor,
  hodometro: null, data_transacao: '2026-10-01T12:00:00-03:00', capacidade_tanque: null,
  ordem_servico: null, departamento: null, ...(origem ? { origem } : {}),
} as LinhaDash);

describe('somenteFrota / resumoCombustivel', () => {
  it('tira baldes avulsos do cartão e as pseudo-placas das requisições', () => {
    const l = [
      linha('GAL7A16', 300, 50),
      linha('TKB8I49', 200, 40, 'requisicao'),
      linha('CLI0002', 1000, 150),
      linha('TRATOR', 500, 80, 'requisicao'),
      linha('QUADRI', 90, 15, 'requisicao'),
    ];
    expect(somenteFrota(l).map((x) => x.placa)).toEqual(['GAL7A16', 'TKB8I49']);
    expect(resumoCombustivel(l)).toEqual({ gasto: 500, litros: 90, abastecimentos: 2 });
  });

  it('resolve o apelido da placa (TKBB8I49 é o Polo TKB8I49) e mantém na frota', () => {
    expect(somenteFrota([linha('TKBB8I49', 10, 2)])).toHaveLength(1);
  });
});
