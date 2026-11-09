import { describe, it, expect } from 'vitest';
import { REGRA_PADRAO, atualizarTitulo, consolidar, diasAtraso, normalizarRegra, parcelar, somarMeses, validarSelecao } from '../divida';

const t = (id: string, vencimento: string, valorAberto: number) => ({ id, vencimento, valorAberto });

describe('diasAtraso', () => {
  it('conta dias corridos e não fica negativo', () => {
    expect(diasAtraso('2026-11-01', '2026-11-16')).toBe(15);
    expect(diasAtraso('2026-11-20', '2026-11-16')).toBe(0);
    expect(diasAtraso(null, '2026-11-16')).toBe(0);
  });
});

describe('atualizarTitulo', () => {
  it('R$ 1.000 com 15 dias: multa 20 + juros 5', () => {
    const a = atualizarTitulo(t('1', '2026-11-01', 1000), REGRA_PADRAO, '2026-11-16');
    expect(a).toMatchObject({ dias: 15, principal: 1000, multa: 20, juros: 5, total: 1025 });
  });
  it('não vencido não tem acréscimo', () => {
    const a = atualizarTitulo(t('1', '2026-12-01', 1000), REGRA_PADRAO, '2026-11-16');
    expect(a.total).toBe(1000);
    expect(a.multa).toBe(0);
  });
  it('dentro da carência não cobra; passou, cobra desde o vencimento', () => {
    const regra = { ...REGRA_PADRAO, carencia_dias: 5 };
    expect(atualizarTitulo(t('1', '2026-11-01', 1000), regra, '2026-11-06').total).toBe(1000);
    const a = atualizarTitulo(t('1', '2026-11-01', 1000), regra, '2026-11-07');
    expect(a.dias).toBe(6);
    expect(a.juros).toBe(2);
    expect(a.multa).toBe(20);
  });
  it('composto rende mais que simples em atraso longo', () => {
    const s = atualizarTitulo(t('1', '2025-11-16', 1000), REGRA_PADRAO, '2026-11-16');
    const c = atualizarTitulo(t('1', '2025-11-16', 1000), { ...REGRA_PADRAO, tipo_juros: 'composto' }, '2026-11-16');
    expect(s.juros).toBe(121.67); // 365/30 meses × 1 %
    expect(c.juros).toBeGreaterThan(s.juros);
  });
});

describe('consolidar', () => {
  it('soma os títulos e aplica desconto só nos encargos', () => {
    const c = consolidar([t('1', '2026-11-01', 1000), t('2', '2026-11-16', 500)], { ...REGRA_PADRAO, desconto_pct: 50 }, '2026-11-16');
    expect(c.principal).toBe(1500);
    expect(c.multa).toBe(20);
    expect(c.juros).toBe(5);
    expect(c.desconto).toBe(12.5);
    expect(c.total).toBe(1512.5);
  });
});

describe('parcelar', () => {
  it('parcelas iguais fecham o total com sobra na última', () => {
    const p = parcelar(100, 1, { quantidade: 3, primeiroVencimento: '2026-01-31', modo: 'sem_juros' });
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p.map((x) => x.vencimento)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
  it('Price cobra juros no parcelamento', () => {
    const p = parcelar(1000, 1, { quantidade: 3, primeiroVencimento: '2026-12-10', modo: 'price' });
    expect(p[0].valor).toBe(340.02);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1020.06, 2);
  });
  it('somarMeses atravessa o ano', () => {
    expect(somarMeses('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('validarSelecao e normalizarRegra', () => {
  it('recusa misturar empresas, lados ou títulos pagos', () => {
    expect(validarSelecao([])).toMatch(/Marque/);
    expect(validarSelecao([{ conta: 'NOVA', tipo: 'receber', aberto: true }, { conta: 'CASTRO', tipo: 'receber', aberto: true }])).toMatch(/Uma empresa/);
    expect(validarSelecao([{ conta: 'NOVA', tipo: 'pagar', aberto: true }])).toMatch(/RECEBER/);
    expect(validarSelecao([{ conta: 'NOVA', tipo: 'receber', aberto: false }])).toMatch(/aberto/);
    expect(validarSelecao([{ conta: 'NOVA', tipo: 'receber', aberto: true }])).toBeNull();
  });
  it('saneia valores', () => {
    expect(normalizarRegra({ multa_pct: -3, juros_mes_pct: Number.NaN, tipo_juros: 'x' as never })).toMatchObject({ multa_pct: 0, juros_mes_pct: 1, tipo_juros: 'simples' });
  });
});
