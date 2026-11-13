import { describe, it, expect } from 'vitest';
import {
  gerarParcelas, conferirPagamento, normalizarPagamento, resumoCondicoes,
  numeroBR, somarMesesISO, recalcularPercentuais, PAGAMENTO_VAZIO,
} from '../pagamento';

describe('numeroBR', () => {
  it('lê BR, US e milhar', () => {
    expect(numeroBR('1.290,50')).toBe(1290.5);
    expect(numeroBR('1290.50')).toBe(1290.5);
    expect(numeroBR('150.000')).toBe(150000);
    expect(numeroBR('R$ 250.000,00')).toBe(250000);
    expect(numeroBR(12)).toBe(12);
    expect(numeroBR('')).toBe(0);
  });
});

describe('somarMesesISO', () => {
  it('segura o fim do mês', () => {
    expect(somarMesesISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMesesISO('2026-11-15', 2)).toBe('2027-01-15');
  });
});

describe('gerarParcelas', () => {
  it('divide o saldo com centavos na última', () => {
    const p = gerarParcelas({ total: 1000, entrada: 100, base: '2026-11-13', quantidade: 3, intervalo: 'mensal' });
    expect(p.map((x) => x.valor)).toEqual([300, 300, 300]);
    expect(p.map((x) => x.vencimento)).toEqual(['2026-12-13', '2027-01-13', '2027-02-13']);
    const q = gerarParcelas({ total: 100, base: '2026-11-13', quantidade: 3, intervalo: 30 });
    expect(q.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(q[0].vencimento).toBe('2026-12-13');
  });
  it('aceita lista de dias e carência', () => {
    const p = gerarParcelas({ total: 900, base: '2026-11-01', dias: [30, 60, 90] });
    expect(p.map((x) => x.vencimento)).toEqual(['2026-12-01', '2026-12-31', '2027-01-30']);
    const a = gerarParcelas({ total: 200000, base: '2026-11-01', quantidade: 2, intervalo: 'anual', carenciaDias: 365 });
    expect(a.map((x) => x.vencimento)).toEqual(['2027-11-01', '2028-11-01']);
  });
  it('sem saldo não gera', () => {
    expect(gerarParcelas({ total: 100, entrada: 100, base: '2026-11-01', quantidade: 2 })).toEqual([]);
  });
});

describe('conferirPagamento', () => {
  it('avisa falta e sobra', () => {
    const p = { ...PAGAMENTO_VAZIO, entrada_valor: 100, parcelas: gerarParcelas({ total: 1000, entrada: 100, base: '2026-11-01', quantidade: 3 }) };
    expect(conferirPagamento(p, 1000).ok).toBe(true);
    expect(conferirPagamento(p, 1100).avisos[0]).toMatch(/Faltam/);
    expect(conferirPagamento(p, 900).avisos[0]).toMatch(/passam/);
  });
  it('financiado sem banco avisa', () => {
    const p = { ...PAGAMENTO_VAZIO, forma: 'financiado' as const, parcelas: gerarParcelas({ total: 10, base: '2026-11-01', quantidade: 1 }) };
    expect(conferirPagamento(p, 10).avisos.join()).toMatch(/banco/);
  });
});

describe('normalizarPagamento + resumo', () => {
  it('limpa e resume', () => {
    const p = normalizarPagamento({
      forma: 'misto', entrada_valor: '50.000,00', entrada_data: '2026-11-20',
      parcelas: [{ vencimento: '2027-11-20', valor: '100000', meio: 'financiamento' }, { vencimento: 'x', valor: 'abc' }],
      banco: ' Banco do Brasil ', linha_credito: 'Moderfrota',
    });
    expect(p.entrada_valor).toBe(50000);
    expect(p.parcelas[1].vencimento).toBe('');
    expect(p.parcelas[1].meio).toBe('boleto');
    expect(p.banco).toBe('Banco do Brasil');
    const r = resumoCondicoes({ ...p, parcelas: p.parcelas.slice(0, 1) });
    expect(r).toContain('Entrada');
    expect(r).toContain('1 parcela de');
    expect(r).toContain('Moderfrota · Banco do Brasil');
  });
  it('recalcula percentuais', () => {
    const r = recalcularPercentuais([{ n: 9, vencimento: '2026-12-01', valor: 250, percentual: 0, meio: 'boleto' }], 1000);
    expect(r[0]).toMatchObject({ n: 1, percentual: 25 });
  });
});
