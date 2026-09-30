import { describe, it, expect } from 'vitest';
import { aplicarRecorte, fimDoMes, passaRecorte, resumir, ehRecorte, RECORTES, RECORTE_PADRAO } from '../baixa-contas-recorte';

const HOJE = '2026-09-30';
const T = [
  { id: 1, previsao: '2026-09-29', vencimento: '2026-09-01', valorAberto: 10 }, // atrasado
  { id: 2, previsao: '2026-09-30', vencimento: '2026-09-30', valorAberto: 20 }, // hoje
  { id: 3, previsao: null, vencimento: '2026-09-15', valorAberto: 30 },         // sem previsão => vencimento (atrasado)
  { id: 4, previsao: '2026-10-05', vencimento: '2026-10-05', valorAberto: 40 }, // mês que vem
  { id: 5, previsao: '2027-01-10', vencimento: '2027-01-10', valorAberto: 50 }, // ano que vem
];

describe('recortes por previsão', () => {
  it('atrasados = previsão antes de hoje (sem previsão usa vencimento)', () => {
    expect(aplicarRecorte(T, 'atrasados', HOJE).map((t) => t.id)).toEqual([1, 3]);
  });
  it('até hoje inclui o dia de hoje', () => {
    expect(aplicarRecorte(T, 'ate_hoje', HOJE).map((t) => t.id)).toEqual([1, 2, 3]);
  });
  it('este mês vai até o último dia do mês corrente', () => {
    expect(aplicarRecorte(T, 'mes', HOJE).map((t) => t.id)).toEqual([1, 2, 3]);
    expect(aplicarRecorte(T, 'mes', '2026-10-01').map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });
  it('todos não filtra', () => {
    expect(aplicarRecorte(T, 'todos', HOJE)).toHaveLength(5);
  });
  it('título sem nenhuma data só aparece em "todos"', () => {
    const semData = { previsao: null, vencimento: null };
    expect(passaRecorte(semData, 'ate_hoje', HOJE)).toBe(false);
    expect(passaRecorte(semData, 'todos', HOJE)).toBe(true);
  });
});

describe('fimDoMes', () => {
  it('fevereiro bissexto e dezembro', () => {
    expect(fimDoMes('2028-02-10')).toBe('2028-02-29');
    expect(fimDoMes('2026-12-01')).toBe('2026-12-31');
    expect(fimDoMes('2026-09-30')).toBe('2026-09-30');
  });
});

describe('resumir e catálogo', () => {
  it('soma o valor em aberto', () => {
    expect(resumir(aplicarRecorte(T, 'ate_hoje', HOJE))).toEqual({ n: 3, total: 60 });
    expect(resumir([])).toEqual({ n: 0, total: 0 });
  });
  it('padrão é "até hoje" e ehRecorte valida', () => {
    expect(RECORTE_PADRAO).toBe('ate_hoje');
    expect(RECORTES.map((r) => r.id)).toEqual(['atrasados', 'ate_hoje', 'mes', 'todos']);
    expect(ehRecorte('mes')).toBe(true);
    expect(ehRecorte('lixo')).toBe(false);
  });
});
