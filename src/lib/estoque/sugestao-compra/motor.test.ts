import { describe, it, expect } from 'vitest';
import {
  corrigirCensura, classificarFrequencia, nivelDeServico, invNormal,
  arredondarMultiplo, demandaJanela, analisarConta, consolidar,
  type MesSaida, type IndiceSazonal, type ParamsConta,
} from './motor';

function serieCheia(demandaMensal: number, diasSaldo = 30): MesSaida[] {
  // 12 meses de 2025 com demanda constante e sem ruptura
  return Array.from({ length: 12 }, (_, i) => ({
    ano: 2025, mes: i + 1, demanda: demandaMensal, diasNoMes: 30, diasComSaldoPositivo: diasSaldo,
  }));
}
const idxNeutro: IndiceSazonal = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 1]));
const HOJE = new Date(2026, 0, 1); // 01/01/2026

const paramsBase: ParamsConta = {
  multiploEmbalagem: 1, critico: false, sobEncomenda: false,
  leadTimeUsado: 30, leadTimeOrigem: 'declarado', sigmaLead: 4.5,
  cicloDias: 15, regularidade: 'regular', nivelServicoOverride: null,
};

describe('correção de censura', () => {
  it('mês sem ruptura não altera', () => {
    const { ajustada, fator } = corrigirCensura({ ano: 2025, mes: 1, demanda: 10, diasNoMes: 30, diasComSaldoPositivo: 30 });
    expect(fator).toBe(1); expect(ajustada).toBe(10);
  });
  it('mês metade zerado dobra a demanda', () => {
    const { ajustada, fator } = corrigirCensura({ ano: 2025, mes: 1, demanda: 10, diasNoMes: 30, diasComSaldoPositivo: 15 });
    expect(fator).toBe(2); expect(ajustada).toBe(20);
  });
  it('fator é limitado a 2×', () => {
    const { fator } = corrigirCensura({ ano: 2025, mes: 1, demanda: 10, diasNoMes: 30, diasComSaldoPositivo: 3 });
    expect(fator).toBe(2);
  });
});

describe('regimes por frequência', () => {
  it('≥9 meses = alta/estatistico', () => expect(classificarFrequencia(11)).toEqual({ frequencia: 'alta', regime: 'estatistico' }));
  it('4..8 = media/estatistico', () => expect(classificarFrequencia(5)).toEqual({ frequencia: 'media', regime: 'estatistico' }));
  it('1..3 = baixa/intermitente', () => expect(classificarFrequencia(2)).toEqual({ frequencia: 'baixa', regime: 'intermitente' }));
  it('0 = sem_historico', () => expect(classificarFrequencia(0)).toEqual({ frequencia: 'baixa', regime: 'sem_historico' }));
});

describe('nível de serviço', () => {
  it('matriz A/alta = 0,97', () => expect(nivelDeServico('A', 'alta', false)).toBe(0.97));
  it('C/media = 0,88', () => expect(nivelDeServico('C', 'media', false)).toBe(0.88));
  it('crítico sobrepõe tudo = 0,98', () => expect(nivelDeServico('C', 'media', true)).toBe(0.98));
  it('intermitente (baixa) = 0 (sem colchão)', () => expect(nivelDeServico('A', 'baixa', false)).toBe(0));
  it('override vence a matriz', () => expect(nivelDeServico('A', 'alta', false, 0.9)).toBe(0.9));
});

describe('inversa da normal', () => {
  it('Φ⁻¹(0,975) ≈ 1,96', () => expect(invNormal(0.975)).toBeCloseTo(1.96, 2));
  it('Φ⁻¹(0,5) = 0', () => expect(invNormal(0.5)).toBeCloseTo(0, 6));
  it('Φ⁻¹(0,95) ≈ 1,645', () => expect(invNormal(0.95)).toBeCloseTo(1.645, 2));
});

describe('arredondamento ao múltiplo', () => {
  it('múltiplo 1 = teto', () => expect(arredondarMultiplo(3.2, 1)).toBe(4));
  it('múltiplo 6 arredonda pra cima', () => expect(arredondarMultiplo(7, 6)).toBe(12));
  it('múltiplo 6 exato mantém', () => expect(arredondarMultiplo(12, 6)).toBe(12));
});

describe('janela sazonal', () => {
  it('índice neutro → nivelDiario × dias', () => {
    expect(demandaJanela(2, idxNeutro, HOJE, 45)).toBeCloseTo(90, 6);
  });
  it('índice 2 no mês dobra', () => {
    const idx: IndiceSazonal = { ...idxNeutro, 1: 2 }; // janeiro
    // janela 01/01..14/02: ~31 dias de jan (idx2) + ~14 de fev (idx1)
    const v = demandaJanela(1, idx, HOJE, 45);
    expect(v).toBeGreaterThan(45); expect(v).toBeLessThan(90);
  });
});

describe('motor por conta + consolidação (pooling)', () => {
  it('demanda consolidada soma as contas; SS poolado < soma dos SS', () => {
    const nova = analisarConta({ serie12m: serieCheia(30), estoqueAtual: 20, emTransito: 0 }, idxNeutro, HOJE);
    const castro = analisarConta({ serie12m: serieCheia(30), estoqueAtual: 20, emTransito: 0 }, idxNeutro, HOJE);
    // cada conta: 360/ano → ~0,986/dia → 45d ≈ 44,4
    expect(nova.demanda45d).toBeCloseTo(44.4, 0);
    const r = consolidar({ nova, castro, curva: 'A', params: paramsBase, hoje: HOJE });
    expect(r.demanda45d).toBeCloseTo(88.8, 0);
    expect(r.frequencia).toBe('alta');
    expect(r.regime).toBe('estatistico');
    expect(r.nivelServico).toBe(0.97);
    // Série constante → σ_demanda=0, MAS a irregularidade do fornecedor (σ_LT=4,5)
    // mantém o SS > 0 pelo 2º termo z·√(cmd²·σ_LT²) — "o segundo termo domina".
    expect(r.estoqueSeguranca).toBeGreaterThan(0);
    expect(r.qtdSugerida).toBeGreaterThan(0);
  });

  it('item sob encomenda nunca sugere', () => {
    const nova = analisarConta({ serie12m: serieCheia(30), estoqueAtual: 0, emTransito: 0 }, idxNeutro, HOJE);
    const r = consolidar({ nova, curva: 'B', params: { ...paramsBase, sobEncomenda: true }, hoje: HOJE });
    expect(r.qtdSugerida).toBe(0);
    expect(r.alerta).toBe('nao_comprar');
  });

  it('estoque zerado com demanda e cobertura < lead time = já era', () => {
    const nova = analisarConta({ serie12m: serieCheia(30), estoqueAtual: 0, emTransito: 0 }, idxNeutro, HOJE);
    const r = consolidar({ nova, curva: 'A', params: paramsBase, hoje: HOJE });
    expect(r.alerta).toBe('ja_era');
    expect(r.qtdSugerida).toBeGreaterThan(0);
  });

  it('mínimo manual válido sobrepõe o SS', () => {
    const nova = analisarConta({ serie12m: serieCheia(30, 15), estoqueAtual: 0, emTransito: 0 }, idxNeutro, HOJE);
    const r = consolidar({
      nova, curva: 'A',
      params: { ...paramsBase, minimoManual: 100, minimoManualValidade: '2026-12-31' },
      hoje: HOJE,
    });
    expect(r.minimoOrigem).toBe('manual');
    expect(r.minimoEfetivo).toBe(100);
  });

  it('mínimo manual vencido é ignorado', () => {
    const nova = analisarConta({ serie12m: serieCheia(30), estoqueAtual: 0, emTransito: 0 }, idxNeutro, HOJE);
    const r = consolidar({
      nova, curva: 'A',
      params: { ...paramsBase, minimoManual: 100, minimoManualValidade: '2025-01-01' },
      hoje: HOJE,
    });
    expect(r.minimoOrigem).toBe('calculado');
  });
});
