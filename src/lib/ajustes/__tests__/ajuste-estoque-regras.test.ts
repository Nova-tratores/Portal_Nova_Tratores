import { describe, it, expect } from 'vitest';
import { planejarAjuste, montarObsAjuste, numeroBR, dataHoraBR } from '../ajuste-estoque-regras';

describe('planejarAjuste', () => {
  it('só quantidade: SLD com o CMC atual', () => {
    const p = planejarAjuste({ qtdAtual: 3, cmcAtual: 10, novaQtd: 5 });
    expect(p).toMatchObject({ tipo: 'SLD', quan: 5, valor: 10, motivo: 'INV', qtdFinal: 5, cmcFinal: 10 });
  });

  it('produto zerado ganhando quantidade com custo', () => {
    expect(planejarAjuste({ qtdAtual: 0, cmcAtual: 0, novaQtd: 4, novoCusto: 25 }))
      .toMatchObject({ tipo: 'SLD', quan: 4, valor: 25, motivo: 'INV' });
  });

  it('produto zerado com CMC antigo: só a qtd basta', () => {
    expect(planejarAjuste({ qtdAtual: 0, cmcAtual: 8, novaQtd: 2 })).toMatchObject({ tipo: 'SLD', quan: 2, valor: 8 });
  });

  it('produto sem custo ganhando qtd exige custo', () => {
    expect(planejarAjuste({ qtdAtual: 0, cmcAtual: 0, novaQtd: 2 })).toHaveProperty('erro');
  });

  it('só custo: SLD com a qtd atual, motivo CMC', () => {
    expect(planejarAjuste({ qtdAtual: 7, cmcAtual: 10, novoCusto: 12 })).toMatchObject({ tipo: 'SLD', quan: 7, valor: 12, motivo: 'CMC' });
  });

  it('só custo com estoque zerado não dá', () => {
    expect(planejarAjuste({ qtdAtual: 0, cmcAtual: 10, novoCusto: 12 })).toHaveProperty('erro');
  });

  it('zerar: SLD 0 com custo; sem custo vira SAI/ENT', () => {
    expect(planejarAjuste({ qtdAtual: 5, cmcAtual: 10, novaQtd: 0 })).toMatchObject({ tipo: 'SLD', quan: 0, valor: 10 });
    expect(planejarAjuste({ qtdAtual: 5, cmcAtual: 0, novaQtd: 0 })).toMatchObject({ tipo: 'SAI', quan: 5 });
    expect(planejarAjuste({ qtdAtual: -2, cmcAtual: 0, novaQtd: 0 })).toMatchObject({ tipo: 'ENT', quan: 2 });
  });

  it('nada a alterar e valores inválidos', () => {
    expect(planejarAjuste({ qtdAtual: 5, cmcAtual: 10, novaQtd: 5, novoCusto: 10 })).toHaveProperty('erro');
    expect(planejarAjuste({ qtdAtual: 5, cmcAtual: 10 })).toHaveProperty('erro');
    expect(planejarAjuste({ qtdAtual: 5, cmcAtual: 10, novaQtd: -1 })).toHaveProperty('erro');
    expect(planejarAjuste({ qtdAtual: 5, cmcAtual: 10, novoCusto: 0 })).toHaveProperty('erro');
  });
});

describe('montarObsAjuste', () => {
  it('leva data, usuário, resumo e motivo', () => {
    const o = montarObsAjuste({ quando: '26/10/2026 14:32', usuario: 'Henri', motivo: 'contagem', resumo: 'Qtd 3 -> 5' });
    expect(o).toBe('Ajuste portal 26/10/2026 14:32 por Henri - Qtd 3 -> 5 - Motivo: contagem');
  });

  it('corta só o motivo, nunca a identificação', () => {
    const o = montarObsAjuste({ quando: '26/10/2026 14:32', usuario: 'Henri', motivo: 'x'.repeat(500), resumo: 'Qtd 3 -> 5', grupo: 'lote de 2' }, 120);
    expect(o.length).toBe(120);
    expect(o.startsWith('Ajuste portal 26/10/2026 14:32 por Henri (lote de 2)')).toBe(true);
    expect(o.endsWith('...')).toBe(true);
  });
});

describe('numeroBR e dataHoraBR', () => {
  it('lê vírgula e milhar', () => {
    expect(numeroBR('1.234,56')).toBe(1234.56);
    expect(numeroBR('12,5')).toBe(12.5);
    expect(numeroBR('12.5')).toBe(12.5);
    expect(numeroBR('R$ 3,00')).toBe(3);
    expect(numeroBR('')).toBeNull();
    expect(numeroBR('abc')).toBeNull();
  });
  it('hora de Brasília', () => {
    expect(dataHoraBR(new Date('2026-10-26T17:32:00Z'))).toBe('26/10/2026 14:32');
  });
});
