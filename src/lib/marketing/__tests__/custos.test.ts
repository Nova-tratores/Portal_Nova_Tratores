import { describe, it, expect } from 'vitest';
import {
  parseValorMisto,
  valorRateado,
  totaisCusto,
  divergente,
  rankingCategorias,
} from '../custos';
import type { Custo } from '../tipos';

// Molde mínimo — cada teste sobrescreve só o que importa.
const custo = (over: Partial<Custo> = {}): Custo => ({
  id: over.id ?? 'c1',
  acao_id: 'a1',
  descricao: 'item',
  categoria: 'estande',
  fornecedor: null,
  data: null,
  vinculo_tipo: null,
  vinculo_ref: null,
  vinculo_label: null,
  origem: 'manual',
  valor: 0,
  valor_fonte: null,
  sincronizado_em: null,
  rateio_percent: 100,
  status: 'confirmado',
  observacoes: null,
  anexo_url: null,
  criado_em: '2026-01-01T00:00:00Z',
  ...over,
});

describe('parseValorMisto', () => {
  // Os dois formatos que já causaram bug de 100x no repo: o BR com ponto de
  // milhar e o "americano" que o FormFornecedor recebia como "800.00".
  it('lê o formato BR (ponto = milhar, vírgula = decimal)', () => {
    expect(parseValorMisto('1.234,56')).toBeCloseTo(1234.56, 2);
    expect(parseValorMisto('1.234.567,89')).toBeCloseTo(1234567.89, 2);
    expect(parseValorMisto('1550,00')).toBeCloseTo(1550, 2);
  });

  it('lê o formato americano (ponto = decimal) sem multiplicar por mil', () => {
    expect(parseValorMisto('800.00')).toBeCloseTo(800, 2);
    expect(parseValorMisto('1550.5')).toBeCloseTo(1550.5, 2);
  });

  it('aceita número puro e trata vazio/lixo como zero', () => {
    expect(parseValorMisto(1550)).toBe(1550);
    expect(parseValorMisto('')).toBe(0);
    expect(parseValorMisto(null)).toBe(0);
    expect(parseValorMisto(undefined)).toBe(0);
    expect(parseValorMisto('abc')).toBe(0);
    expect(parseValorMisto(NaN)).toBe(0);
  });
});

describe('valorRateado', () => {
  it('rateio de 50% aplica metade', () => {
    expect(valorRateado({ valor: 1000, rateio_percent: 50 })).toBe(500);
  });

  it('rateio ausente ou inválido vale 100%', () => {
    expect(valorRateado({ valor: 1000, rateio_percent: 0 as number })).toBe(1000);
    expect(valorRateado({ valor: 1000, rateio_percent: NaN as unknown as number })).toBe(1000);
  });

  it('rateio acima de 100 não infla o custo', () => {
    expect(valorRateado({ valor: 1000, rateio_percent: 150 })).toBe(1000);
  });
});

describe('totaisCusto', () => {
  it('cancelado não soma; previsto fica fora do confirmado', () => {
    const t = totaisCusto([
      custo({ id: 'a', valor: 1000, status: 'confirmado' }),
      custo({ id: 'b', valor: 500, status: 'previsto' }),
      custo({ id: 'c', valor: 9999, status: 'cancelado' }),
    ]);
    expect(t.confirmado).toBe(1000);
    expect(t.previsto).toBe(500);
    expect(t.cancelado).toBe(9999);
    expect(t.total).toBe(1500);
  });

  it('agrupa por categoria e por origem usando só o confirmado', () => {
    const t = totaisCusto([
      custo({ id: 'a', valor: 1000, categoria: 'estande', origem: 'manual' }),
      custo({ id: 'b', valor: 300, categoria: 'frete', origem: 'requisicao', vinculo_tipo: 'requisicao', vinculo_ref: '6423' }),
      custo({ id: 'c', valor: 700, categoria: 'estande', origem: 'manual' }),
      custo({ id: 'd', valor: 400, categoria: 'frete', status: 'previsto' }),
    ]);
    expect(t.porCategoria).toEqual({ estande: 1700, frete: 300 });
    expect(t.porOrigem).toEqual({ manual: 1700, requisicao: 300 });
  });

  it('lista vazia devolve zeros, não NaN', () => {
    const t = totaisCusto([]);
    expect(t.confirmado).toBe(0);
    expect(t.total).toBe(0);
    expect(t.porCategoria).toEqual({});
  });
});

describe('divergente', () => {
  it('sem valor_fonte não é divergência (custo digitado à mão)', () => {
    expect(divergente({ valor: 1000, valor_fonte: null })).toBe(false);
  });

  it('origem mudou de valor -> divergente', () => {
    expect(divergente({ valor: 1000, valor_fonte: 1200 })).toBe(true);
  });

  it('diferença de centavo de arredondamento não conta', () => {
    expect(divergente({ valor: 1000, valor_fonte: 1000.004 })).toBe(false);
  });

  it('compara respeitando o formato BR da origem', () => {
    // valor_fonte pode chegar como texto vindo de "Requisicao".valor_despeza.
    expect(divergente({ valor: 1234.56, valor_fonte: '1.234,56' as unknown as number })).toBe(false);
  });
});

describe('rankingCategorias', () => {
  it('ordena da maior pra menor e calcula o percentual', () => {
    const r = rankingCategorias({ estande: 700, frete: 300 });
    expect(r.map((x) => x.id)).toEqual(['estande', 'frete']);
    expect(r[0].percent).toBeCloseTo(70, 5);
    expect(r[0].label).toBe('Estande');
  });

  it('total zero não vira NaN no percentual', () => {
    const r = rankingCategorias({ estande: 0 });
    expect(r).toEqual([]);
  });
});
