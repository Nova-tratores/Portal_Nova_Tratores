import { describe, expect, it } from 'vitest';
import { alertasDoClima, climaDoOpenMeteo, concorrentesNaCidade, porCategoria, semSubitens, serieAnual, valorPor, valorSidra } from '../cidade';

const PERDIDA = 'Concluida- Não vendido.';

describe('cidade — SIDRA', () => {
  it('valorSidra trata os marcadores de "sem dado"', () => {
    expect(valorSidra('427')).toBe(427);
    expect(valorSidra('...')).toBeNull();
    expect(valorSidra('-')).toBeNull();
    expect(valorSidra('X')).toBeNull();
  });

  it('valorPor acha pela descrição e pelo ano', () => {
    const ls = [
      { V: '926203', D2N: 'Produto Interno Bruto a preços correntes', D3N: '2021' },
      { V: '91330', D2N: 'Valor adicionado bruto a preços correntes da agropecuária', D3N: '2021' },
      { V: '...', D2N: 'Valor adicionado bruto a preços correntes da agropecuária', D3N: '2023' },
    ];
    expect(valorPor(ls, 'agropecuária', '2021')).toBe(91330);
    expect(valorPor(ls, 'agropecuária', '2023')).toBeNull();
  });

  it('semSubitens junta o total e tira os subitens', () => {
    const r = semSubitens([
      { nome: 'Café (em grão) Total', valor: 100 }, { nome: 'Café (em grão) Arábica', valor: 100 },
      { nome: 'Soja (em grão)', valor: 90 }, { nome: 'Galináceos - total', valor: 7 }, { nome: 'Galináceos - galinhas', valor: 2 },
    ]);
    expect(r.map((x) => x.nome)).toEqual(['Café (em grão)', 'Soja (em grão)', 'Galináceos']);
  });

  it('porCategoria ordena e ignora zero', () => {
    const r = porCategoria([{ V: '10', D4N: 'Milho' }, { V: '-', D4N: 'Trigo' }, { V: '30', D4N: 'Soja' }]);
    expect(r).toEqual([{ nome: 'Soja', valor: 30 }, { nome: 'Milho', valor: 10 }]);
  });

  it('serieAnual junta área e valor por ano', () => {
    const r = serieAnual([{ V: '100', D3N: '2024' }, { V: '120', D3N: '2025' }], [{ V: '5', D3N: '2025' }]);
    expect(r).toEqual([{ ano: '2024', areaHa: 100, valorMil: null }, { ano: '2025', areaHa: 120, valorMil: 5 }]);
  });
});

describe('cidade — clima', () => {
  const dia = (chuvaMm: number, tmin = 15) => ({ data: '2026-10-19', chuvaMm, prob: 50, tmin, tmax: 28 });
  it('lê o Open-Meteo', () => {
    const r = climaDoOpenMeteo({ daily: { time: ['2026-10-19'], precipitation_sum: [3.2], precipitation_probability_max: [40], temperature_2m_min: [12], temperature_2m_max: [27] } });
    expect(r).toEqual([{ data: '2026-10-19', chuvaMm: 3.2, prob: 40, tmin: 12, tmax: 27 }]);
    expect(climaDoOpenMeteo(null)).toEqual([]);
  });
  it('avisa geada, chuva forte e semana seca', () => {
    expect(alertasDoClima([dia(0, 2), dia(0), dia(0), dia(0), dia(0)]).join(' ')).toMatch(/geada.*Semana seca/);
    expect(alertasDoClima([dia(45), dia(0), dia(0), dia(0), dia(0)])[0]).toMatch(/Chuva forte/);
    expect(alertasDoClima([dia(10), dia(15), dia(5), dia(0), dia(0)])[0]).toMatch(/bom para o plantio/);
  });
});

describe('cidade — concorrentes', () => {
  const p = (Cidade: string, concorrente: string | null, status = PERDIDA) => ({ Cidade, status, concorrente, concorrente_valor: 100, fechado_em: '2026-05-01', status_desde: null, criado_em: null });
  it('conta só as perdidas da cidade, agrupando o concorrente', () => {
    const r = concorrentesNaCidade([
      p('Piraju', 'john deere'), p('PIRAJU (SP)', 'John Deere'), p('Piraju', null), p('Avaré', 'Massey'), p('Piraju', 'Valtra', 'Concluida-Vendido'),
    ], 'Piraju', PERDIDA);
    expect(r.total).toBe(3);
    expect(r.lista).toEqual([{ nome: 'John Deere', perdas: 2, valor: 200, ultima: '2026-05-01' }]);
  });
});
