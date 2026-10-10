import { describe, it, expect } from 'vitest';
import { inicioSemana, semanaIso, montarSemanas, agruparDias, periodosDaComparacao, somarSemanas, posicaoNoMes, semanaEquivalenteMesAnterior, diasUteisSemana } from './historico-semanas';

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

describe('comparações prontas entre semanas', () => {
  // semanas fechadas, mais recente primeiro (hoje = 09/10/2026, semana 41 parcial)
  const fechadas = ['2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07', '2026-08-31', '2026-08-24', '2026-08-17', '2026-08-10'];
  it('última × anterior e últimas 4 × 4 anteriores', () => {
    expect(periodosDaComparacao('ultima_anterior', fechadas)).toMatchObject({ a: { inicios: ['2026-09-28'] }, b: { inicios: ['2026-09-21'] } });
    const r = periodosDaComparacao('ult4_ant4', fechadas)!;
    expect(r.a.inicios).toEqual(['2026-09-28', '2026-09-21', '2026-09-14', '2026-09-07']);
    expect(r.b.inicios).toEqual(['2026-08-31', '2026-08-24', '2026-08-17', '2026-08-10']);
    expect(r.a.rotulo).toBe('07/09–04/10/26 (4 sem.)');
  });
  it('mesma semana do ano passado = mesmo nº ISO', () => {
    const r = periodosDaComparacao('ultima_ano', fechadas)!;
    expect(r.a.rotulo).toBe('sem. 40 · 28/09–04/10/26');
    expect(r.b.inicios).toEqual(['2025-09-29']);
    expect(semanaIso('2025-09-29')).toEqual({ ano: 2025, semana: 40 });
  });
  it('sem semanas suficientes → null; escolher precisa das duas', () => {
    expect(periodosDaComparacao('ult13_ano', fechadas)).toBeNull();
    expect(periodosDaComparacao('escolher', fechadas)).toBeNull();
    expect(periodosDaComparacao('escolher', fechadas, { a: '2026-09-28', b: '2025-09-29' })?.b.inicios).toEqual(['2025-09-29']);
  });
  it('somarSemanas conta o que falta', () => {
    const linhas = montarSemanas([{ inicio: '2026-09-21', valor: 100, custo: 0 }, { inicio: '2026-09-28', valor: 50, custo: 0 }], { metrica: 'venda', hoje: new Date(2026, 9, 9), baseMin: 1 });
    expect(somarSemanas(linhas, ['2026-09-28', '2026-09-21', '2026-09-14'])).toEqual({ valor: 150, faltando: 1 });
  });
});

describe('semana equivalente do mês anterior e dias úteis', () => {
  it('posição no mês pela quinta-feira', () => {
    expect(posicaoNoMes('2026-10-05')).toEqual({ ano: 2026, mes: 10, pos: 2 }); // quinta 08/10
    expect(posicaoNoMes('2026-09-28')).toEqual({ ano: 2026, mes: 10, pos: 1 }); // quinta 01/10 → 1ª de outubro
    expect(posicaoNoMes('2026-09-21')).toEqual({ ano: 2026, mes: 9, pos: 4 });
  });
  it('equivalente: mesma posição no mês anterior; 5ª sem par → null', () => {
    expect(semanaEquivalenteMesAnterior('2026-10-05')).toBe('2026-09-07'); // 2ª de out → 2ª de set (quinta 10/09)
    expect(semanaEquivalenteMesAnterior('2026-09-28')).toBe('2026-08-31'); // 1ª de out → 1ª de set (quinta 03/09)
    expect(semanaEquivalenteMesAnterior('2026-01-05')).toBe('2025-12-08'); // 2ª de jan (01/01 é quinta) → 2ª de dez
    expect(semanaEquivalenteMesAnterior('2026-07-27')).toBeNull(); // 5ª de julho (quinta 30/07); junho só tem 4 quintas
  });
  it('dias úteis: 07/09/2026 (Independência) → 4', () => {
    expect(diasUteisSemana('2026-09-07', new Set(['2026-09-07']))).toBe(4);
    expect(diasUteisSemana('2026-09-14', new Set(['2026-09-07']))).toBe(5);
  });
  it('montarSemanas traz Δ do mês e dias úteis', () => {
    const r = montarSemanas([
      { inicio: '2026-09-07', valor: 1000, custo: 0 },
      { inicio: '2026-10-05', valor: 1500, custo: 0 },
    ], { metrica: 'venda', hoje: new Date(2026, 9, 14), baseMin: 1, feriados: new Set(['2026-09-07', '2026-10-12']) });
    const s41 = r.find((l) => l.inicio === '2026-10-05')!;
    expect(s41.deltaMes?.pct).toBeCloseTo(50);
    expect(r.find((l) => l.inicio === '2026-09-07')!.diasUteis).toBe(4);
    expect(r.find((l) => l.inicio === '2026-10-12')!.diasUteis).toBe(4);
  });
  it('preset última × equivalente do mês anterior', () => {
    expect(periodosDaComparacao('ultima_mes', ['2026-09-28', '2026-09-21'])?.b.inicios).toEqual(['2026-08-31']);
  });
});
