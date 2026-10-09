import { describe, it, expect } from 'vitest';
import { inicioSemana, semanaIso, montarSemanas, agruparDias } from './historico-semanas';

describe('inicioSemana / semanaIso', () => {
  it('segunda-feira da semana (domingo pertence à semana que começou na segunda anterior)', () => {
    expect(inicioSemana('2026-10-09')).toBe('2026-10-05'); // sexta
    expect(inicioSemana('2026-10-05')).toBe('2026-10-05'); // segunda
    expect(inicioSemana('2026-10-11')).toBe('2026-10-05'); // domingo
    expect(inicioSemana('2026-01-01')).toBe('2025-12-29'); // virada de ano
  });
  it('semana ISO: 29/12/2025 é a semana 1 de 2026; 2026 tem 53 semanas', () => {
    expect(semanaIso('2025-12-29')).toEqual({ ano: 2026, semana: 1 });
    expect(semanaIso('2026-10-05')).toEqual({ ano: 2026, semana: 41 });
    expect(semanaIso('2026-12-28')).toEqual({ ano: 2026, semana: 53 });
    expect(semanaIso('2025-01-06')).toEqual({ ano: 2025, semana: 2 });
  });
});

describe('montarSemanas', () => {
  const hoje = new Date(2026, 9, 9); // sexta 09/10/2026
  const base = { metrica: 'venda' as const, hoje, baseMin: 1000 };

  it('mais recente primeiro, semana corrente parcial sem Δ, buraco vira 0', () => {
    const r = montarSemanas([
      { inicio: '2026-09-21', valor: 4000, custo: 0 },
      { inicio: '2026-10-05', valor: 1500, custo: 0 },
      // 28/09 sem venda
    ], base);
    expect(r.map((l) => l.inicio)).toEqual(['2026-10-05', '2026-09-28', '2026-09-21']);
    expect(r[0]).toMatchObject({ parcial: true, deltaAnt: null, rotulo: '05/10–11/10' });
    expect(r[1].valor).toBe(0);
    expect(r[1].deltaAnt?.pct).toBeCloseTo(-100);
    expect(r[2].deltaAnt).toBeNull(); // antes da 1ª semana com venda = sem dados
  });

  it('Δ ano anterior = mesma semana ISO do ano anterior', () => {
    const r = montarSemanas([
      { inicio: '2025-09-29', valor: 2000, custo: 0 }, // semana 40/2025
      { inicio: '2026-09-28', valor: 3000, custo: 0 }, // semana 40/2026
    ], base);
    const s40 = r.find((l) => l.inicio === '2026-09-28')!;
    expect(s40.semanaIso).toBe(40);
    expect(s40.deltaAno?.pct).toBeCloseTo(50);
  });

  it('semana 53 sem par no ano anterior → sem Δ ano', () => {
    const r = montarSemanas([{ inicio: '2025-01-06', valor: 5000, custo: 0 }, { inicio: '2026-12-28', valor: 5000, custo: 0 }], { ...base, hoje: new Date(2027, 0, 10) });
    expect(r.find((l) => l.inicio === '2026-12-28')!.deltaAno).toBeNull();
  });

  it('usa a métrica (margem = venda − custo)', () => {
    const r = montarSemanas([{ inicio: '2026-09-28', valor: 5000, custo: 2000 }], { ...base, metrica: 'margem' });
    expect(r.find((l) => l.inicio === '2026-09-28')!.valor).toBe(3000);
  });
});

describe('agruparDias', () => {
  it('soma por semana e por mês', () => {
    const dias = [
      { data: '2026-09-30', h: 2 }, { data: '2026-10-01', h: 3 }, { data: '2026-10-05', h: 4 },
    ];
    expect(agruparDias(dias, ['h'], 'semana')).toEqual([{ chave: '2026-09-28', h: 5 }, { chave: '2026-10-05', h: 4 }]);
    expect(agruparDias(dias, ['h'], 'mes')).toEqual([{ chave: '2026-09', h: 2 }, { chave: '2026-10', h: 7 }]);
  });
});
