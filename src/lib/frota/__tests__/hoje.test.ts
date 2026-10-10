import { describe, it, expect } from 'vitest';
import { montarHoje, variacao, type EntradaHoje, type VeiculoHoje } from '../hoje';

const AGORA = new Date('2026-10-10T12:00:00Z').getTime();
const v = (over: Partial<VeiculoHoje>): VeiculoHoje => ({
  id: 'v1', placa: 'GAL7A16', modelo: 'CARGO', marca: 'FORD', descricao: null,
  status: 'ativo', ativo: true, tipo_registro: 'veiculo', pendencia_vinculo: false, ...over,
});
const base = (over: Partial<EntradaHoje> = {}): EntradaHoje => ({
  agora: AGORA,
  veiculos: [v({})],
  responsaveis: [{ veiculo_id: 'v1', motorista_nome: 'Danilo' }],
  pendencias: [],
  componentes: new Map(),
  documentos: [],
  ...over,
});

describe('montarHoje', () => {
  it('parado pela Ficha e por pendência crítica, com o motivo', () => {
    const h = montarHoje(base({
      veiculos: [v({}), v({ id: 'v2', placa: 'TKB8I49', status: 'manutencao' })],
      responsaveis: [{ veiculo_id: 'v1', motorista_nome: 'Danilo' }, { veiculo_id: 'v2', motorista_nome: 'Ana' }],
      pendencias: [{ id: 'p1', placa: 'GAL7A16', titulo: 'Sem freio', origem: 'manual', gravidade: 'critica', componente_id: null, aberta_em: '2026-10-01' }],
    }));
    expect(h.parados.map((p) => [p.placa, p.motivos[0]])).toEqual([
      ['GAL7A16', 'Sem freio'],
      ['TKB8I49', 'Em manutenção (Ficha)'],
    ]);
  });

  it('graves = crítica + grave, crítica primeiro; leve/média ficam fora', () => {
    const h = montarHoje(base({
      pendencias: [
        { id: 'a', placa: 'GAL7A16', titulo: 'Farol', origem: 'manual', gravidade: 'leve', componente_id: null, aberta_em: '2026-10-01' },
        { id: 'b', placa: 'GAL7A16', titulo: 'Pneu', origem: 'checklist', gravidade: 'grave', componente_id: null, aberta_em: '2026-09-01' },
        { id: 'c', placa: 'GAL7A16', titulo: 'Freio', origem: 'manual', gravidade: 'critica', componente_id: null, aberta_em: '2026-10-05' },
      ],
    }));
    expect(h.graves.map((g) => g.id)).toEqual(['c', 'b']);
  });

  it('documento vencido/vencendo entra; renovado (vigência nova longe) não cobra', () => {
    const h = montarHoje(base({
      documentos: [
        { veiculo_id: 'v1', tipo: 'seguro', vigencia_fim: '2026-10-20' },
        { veiculo_id: 'v1', tipo: 'crlv', vigencia_fim: '2026-09-30' },
        { veiculo_id: 'v1', tipo: 'crlv', vigencia_fim: '2027-09-30' },
      ],
    }));
    expect(h.documentos).toEqual([expect.objectContaining({ tipo: 'Seguro', vencido: false, dias: 10 })]);
  });

  it('cadastro: sem responsável (placeholder conta como vazio) e vínculo incompleto', () => {
    const h = montarHoje(base({
      veiculos: [v({ pendencia_vinculo: true })],
      responsaveis: [{ veiculo_id: 'v1', motorista_nome: 'Vazio' }],
    }));
    expect(h.cadastro[0].problemas).toHaveLength(2);
  });

  it('vendido/inativo não entra em nada', () => {
    const h = montarHoje(base({ veiculos: [v({ status: 'vendido' })], responsaveis: [] }));
    expect(h.ativos).toBe(0);
    expect(h.cadastro).toHaveLength(0);
  });

  it('variacao', () => {
    expect(variacao(110, 100)).toBeCloseTo(10);
    expect(variacao(5, 0)).toBeNull();
  });
});
