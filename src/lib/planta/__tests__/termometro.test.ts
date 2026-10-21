import { describe, it, expect } from 'vitest';
import { calcularMedias, situacaoMeta, comparar, montarTermometro, medida } from '../termometro';

const HOJE = '2026-10-21';
const dia = (n: number) => new Date(new Date(HOJE + 'T12:00:00Z').getTime() - n * 86400_000).toISOString().slice(0, 10);

describe('calcularMedias', () => {
  it('usa só dias fechados (antes de hoje) e a medida principal (valor quando há)', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ dia: dia(n), valor: n * 100, contagem: 1 }));
    xs.push({ dia: HOJE, valor: 99999, contagem: 1 }); // hoje não entra
    const m = calcularMedias(xs, HOJE);
    expect(m.semana).toEqual({ media: 400, dias: 7 });
  });
  it('janela com poucos dias fica "juntando histórico" (media null) e conta os dias', () => {
    const xs = [1, 2, 3].map((n) => ({ dia: dia(n), valor: null, contagem: 10 }));
    const m = calcularMedias(xs, HOJE);
    expect(m.semana).toEqual({ media: null, dias: 3 });
    expect(m.mes).toEqual({ media: null, dias: 3 });
  });
  it('sem valor usa a contagem; dia fora da janela não entra', () => {
    const xs = [1, 2, 3, 4, 5].map((n) => ({ dia: dia(n), valor: null, contagem: n }));
    xs.push({ dia: dia(10), valor: null, contagem: 1000 });
    expect(calcularMedias(xs, HOJE).semana).toEqual({ media: 3, dias: 5 });
  });
});

describe('situacaoMeta', () => {
  it('menor é melhor: abaixo verde, até a tolerância amarelo, acima vermelho', () => {
    expect(situacaoMeta(90, 100, 10, 'menor')).toBe('verde');
    expect(situacaoMeta(108, 100, 10, 'menor')).toBe('amarelo');
    expect(situacaoMeta(120, 100, 10, 'menor')).toBe('vermelho');
  });
  it('maior é melhor (inclusive meta negativa, ex.: saída líquida)', () => {
    expect(situacaoMeta(110, 100, 10, 'maior')).toBe('verde');
    expect(situacaoMeta(95, 100, 10, 'maior')).toBe('amarelo');
    expect(situacaoMeta(-150000, -100000, 20, 'maior')).toBe('vermelho');
    expect(situacaoMeta(-110000, -100000, 20, 'maior')).toBe('amarelo');
  });
  it('neutro = alvo: perto da meta verde', () => {
    expect(situacaoMeta(105, 100, 10, 'neutro')).toBe('verde');
    expect(situacaoMeta(85, 100, 10, 'neutro')).toBe('amarelo');
    expect(situacaoMeta(150, 100, 10, 'neutro')).toBe('vermelho');
  });
});

describe('comparar com a média', () => {
  it('menor é melhor: subir é ruim', () => {
    expect(comparar(120, 100, 'menor')).toEqual({ delta_pct: 20, bom: false });
    expect(comparar(80, 100, 'menor')).toEqual({ delta_pct: -20, bom: true });
  });
  it('neutro não diz se é bom; sem média não compara', () => {
    expect(comparar(120, 100, 'neutro')).toEqual({ delta_pct: 20, bom: null });
    expect(comparar(120, null, 'menor')).toEqual({ delta_pct: null, bom: null });
  });
  it('média negativa: o % segue o sentido do movimento', () => {
    expect(comparar(-50, -100, 'maior')).toEqual({ delta_pct: 50, bom: true });
  });
});

describe('montarTermometro', () => {
  const medias = { semana: { media: 100, dias: 7 }, mes: { media: null, dias: 7 }, ano: { media: null, dias: 7 } };
  it('meta vale só na linha "Todas"; em NOVA avisa que a meta é da visão Todas', () => {
    const t = montarTermometro({ kpi_id: 'pagar_vencido', conta: 'TODAS', valor: 150, contagem: 3, medias }, { meta: 120, tolerancia_pct: 10 });
    expect(t.meta).toMatchObject({ meta: 120, situacao: 'vermelho' });
    expect(t.janelas[0]).toMatchObject({ id: 'semana', media: 100, delta_pct: 50, bom: false });
    const n = montarTermometro({ kpi_id: 'pagar_vencido', conta: 'NOVA', valor: 150, contagem: 3, medias }, { meta: 120, tolerancia_pct: 10 });
    expect(n.meta).toBeNull();
    expect(n.meta_so_todas).toBe(true);
  });
  it('sem médias gravadas nem meta: janelas vazias, sem cor', () => {
    const t = montarTermometro({ kpi_id: 'os_atrasada', conta: 'TODAS', valor: null, contagem: 26 }, null);
    expect(t.atual).toBe(26);
    expect(t.janelas.every((j) => j.media === null && j.dias === 0)).toBe(true);
    expect(t.meta).toBeNull();
  });
  it('medida: R$ quando há valor, senão contagem', () => {
    expect(medida({ valor: 10.5, contagem: 3 })).toBe(10.5);
    expect(medida({ valor: null, contagem: 3 })).toBe(3);
  });
});
