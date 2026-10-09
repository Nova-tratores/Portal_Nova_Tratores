import { describe, it, expect } from 'vitest';
import { montarGrade, delta, valorDaMetrica, diasUteis, projetarMes, type PontoMes } from './historico-grade';

// Série de jan/2024 a out/2026 com valor = 1000 × mês (custo = metade).
function serie(ateAno = 2026, ateMes = 10): PontoMes[] {
  const out: PontoMes[] = [];
  for (let a = 2024; a <= ateAno; a++) {
    for (let m = 1; m <= 12; m++) {
      if (a === ateAno && m > ateMes) break;
      out.push({ ano: a, mes: m, valor: 1000 * m * (a - 2023), custo: 500 * m * (a - 2023), qtde: m });
    }
  }
  return out;
}
const HOJE = new Date(2026, 9, 8); // 08/10/2026
const base = { metrica: 'venda' as const, comparacao: 'yoy' as const, hoje: HOJE, anoInicial: 2024, baseMin: 1000 };

describe('delta / valorDaMetrica', () => {
  it('base zero ou ausente → null; base pequena marcada', () => {
    expect(delta(10, 0, 1000)).toBeNull();
    expect(delta(10, null, 1000)).toBeNull();
    expect(delta(150, 100, 1000)).toEqual({ pct: 50, basePequena: true });
    expect(delta(3000, 2000, 1000)).toEqual({ pct: 50, basePequena: false });
  });
  it('margem = venda − custo', () => {
    expect(valorDaMetrica({ valor: 10, custo: 4 }, 'margem')).toBe(6);
  });
});

describe('montarGrade', () => {
  it('anos do mais recente para o mais antigo; meses futuros vazios', () => {
    const g = montarGrade(serie(), base);
    expect(g.anos.map((a) => a.ano)).toEqual([2026, 2025, 2024]);
    const a26 = g.anos[0];
    expect(a26.meses[10].futuro).toBe(true);
    expect(a26.meses[10].valor).toBeNull();
  });

  it('mês corrente é parcial e não tem Δ', () => {
    const out = montarGrade(serie(), base).anos[0].meses[9];
    expect(out.parcial).toBe(true);
    expect(out.valor).toBe(30000);
    expect(out.delta).toBeNull();
  });

  it('YoY: mesmo mês do ano anterior', () => {
    const mar26 = montarGrade(serie(), base).anos[0].meses[2];
    expect(mar26.delta?.pct).toBeCloseTo(50); // 9000 vs 6000
  });

  it('MoM: janeiro compara com dezembro do ano anterior', () => {
    const g = montarGrade(serie(), { ...base, comparacao: 'mom' });
    expect(g.anos[0].meses[0].delta?.pct).toBeCloseTo(((3000 - 24000) / 24000) * 100);
    expect(g.anos[0].meses[1].delta?.pct).toBeCloseTo(100); // 6000 vs 3000
  });

  it('1º ano sem ano anterior carregado → sem Δ YoY', () => {
    const a24 = montarGrade(serie(), base).anos[2];
    expect(a24.meses[5].delta).toBeNull();
    expect(a24.delta).toBeNull();
  });

  it('trimestre: soma de 3 meses; incompleto mostra soma sem Δ', () => {
    const a26 = montarGrade(serie(), base).anos[0];
    expect(a26.trimestres[0]).toMatchObject({ valor: 3000 * 6, completo: true });
    expect(a26.trimestres[0].delta?.pct).toBeCloseTo(50);
    expect(a26.trimestres[3]).toMatchObject({ valor: 30000, completo: false, delta: null }); // só out parcial
  });

  it('trimestre MoM: T1 compara com o T4 do ano anterior', () => {
    const a26 = montarGrade(serie(), { ...base, comparacao: 'mom' }).anos[0];
    const t4_25 = 2000 * (10 + 11 + 12);
    expect(a26.trimestres[0].delta?.pct).toBeCloseTo(((3000 * 6 - t4_25) / t4_25) * 100);
  });

  it('ano corrente: Δ só sobre os meses fechados (jan–set) contra os mesmos meses', () => {
    const a26 = montarGrade(serie(), base).anos[0];
    expect(a26.mesesFechados).toBe(9);
    expect(a26.total).toBe(3000 * 55); // inclui outubro parcial
    expect(a26.delta?.pct).toBeCloseTo(50); // 3000×45 vs 2000×45
  });

  it('ano completo: total, ticket e Δ do ano cheio', () => {
    const a25 = montarGrade(serie(), base).anos[1];
    expect(a25.total).toBe(2000 * 78);
    expect(a25.qtde).toBe(78);
    expect(a25.ticket).toBe(2000);
    expect(a25.delta?.pct).toBeCloseTo(100);
  });

  it('contagem desconhecida num mês → ticket some', () => {
    const s = serie().map((p) => (p.ano === 2025 && p.mes === 4 ? { ...p, qtde: null } : p));
    expect(montarGrade(s, base).anos[1].ticket).toBeNull();
  });

  it('métrica custo/margem', () => {
    const custo = montarGrade(serie(), { ...base, metrica: 'custo' }).anos[1];
    const margem = montarGrade(serie(), { ...base, metrica: 'margem' }).anos[1];
    expect(custo.total).toBe(1000 * 78);
    expect(margem.total).toBe(1000 * 78);
  });

  it('maxMes considera só meses até hoje', () => {
    expect(montarGrade(serie(), base).maxMes).toBe(30000); // out/2026 (parcial) = 3000×10
  });

  it('meses zerados antes do 1º mês com venda são "sem dados" (não viram base do Δ)', () => {
    const s = [
      ...Array.from({ length: 10 }, (_, i) => ({ ano: 2024, mes: i + 1, valor: 0, custo: 0, qtde: 0 })),
      { ano: 2024, mes: 11, valor: 5000, custo: 0, qtde: 5 },
      { ano: 2024, mes: 12, valor: 5000, custo: 0, qtde: 5 },
      ...Array.from({ length: 12 }, (_, i) => ({ ano: 2025, mes: i + 1, valor: 8000, custo: 0, qtde: 8 })),
    ];
    const a25 = montarGrade(s, { ...base, anoInicial: 2025 }).anos.find((a) => a.ano === 2025)!;
    expect(a25.delta).toBeNull();
    expect(a25.trimestres[0].delta).toBeNull();
    expect(a25.trimestres[3].delta).toBeNull(); // T4/2024 só tem nov+dez
    expect(a25.meses[11].delta?.pct).toBeCloseTo(60); // dez tem base
  });
});

describe('dias úteis e projeção', () => {
  const feriados = new Set(['2026-10-12']); // N. Sra. Aparecida (segunda)
  it('conta seg–sex fora dos feriados', () => {
    expect(diasUteis(2026, 10, new Set())).toBe(22);
    expect(diasUteis(2026, 10, feriados)).toBe(21);
    expect(diasUteis(2026, 10, feriados, 7)).toBe(5); // 1–2 e 5–7
    expect(diasUteis(2026, 10, feriados, 13)).toBe(8); // pula o 12
  });
  it('projeta pelo ritmo; antes de 5 dias úteis não projeta', () => {
    expect(projetarMes(50000, 5, 20)).toBe(200000);
    expect(projetarMes(50000, 4, 20)).toBeNull();
    expect(projetarMes(50000, 0, 0)).toBeNull();
  });
  it('a grade projeta só o mês corrente', () => {
    const g = montarGrade(serie(), { ...base, diasUteisMes: { decorridos: 5, total: 21 } });
    expect(g.anos[0].meses[9].projetado).toBeCloseTo(30000 * 21 / 5);
    expect(g.anos[0].meses[8].projetado).toBeNull();
    expect(montarGrade(serie(), base).anos[0].meses[9].projetado).toBeNull();
  });
});
