import { describe, it, expect } from 'vitest';
import { parseHoras, dataIso, normalizarTecnico, diasDoRelatorio } from './horas-tecnico';

describe('parseHoras / dataIso / normalizarTecnico', () => {
  it('lê os formatos do relatório', () => {
    expect(parseHoras('2h40m')).toBe(2.67);
    expect(parseHoras('3h')).toBe(3);
    expect(parseHoras('40m')).toBe(0.67);
    expect(parseHoras('2:30')).toBe(2.5);
    expect(parseHoras('1,5')).toBe(1.5);
    expect(parseHoras('')).toBe(0);
  });
  it('datas ISO e BR', () => {
    expect(dataIso('2026-09-24')).toBe('2026-09-24');
    expect(dataIso('2026-09-24T10:00:00')).toBe('2026-09-24');
    expect(dataIso('24/09/2026')).toBe('2026-09-24');
    expect(dataIso('')).toBeNull();
  });
  it('une grafias do mesmo técnico', () => {
    expect(normalizarTecnico('DANILO DE SOUZA')).toBe('Danilo de Souza');
    expect(normalizarTecnico('  danilo  de souza ')).toBe('Danilo de Souza');
    expect(normalizarTecnico('')).toBe('');
  });
});

describe('diasDoRelatorio', () => {
  it('OS-0785: 24/09, 13:00–16:00 = 3 h para Gabriel Moraes', () => {
    expect(diasDoRelatorio({ Ordem_Servico: 'OS-0785', TecResp1: 'Gabriel Moraes', DataInicio: '2026-09-24', InicioHora: '13:00', FinalHora: '16:00', DataInicio2: '', TotalHora: '3h' }))
      .toEqual([{ os: 'OS-0785', data: '2026-09-24', tecnico: 'Gabriel Moraes', horas: 3 }]);
  });
  it('3 dias com horários (inclusive a coluna FinaHora3)', () => {
    const r = diasDoRelatorio({
      TecResp1: 'Nicolas Dario',
      DataInicio: '2026-09-01', InicioHora: '08:00', FinalHora: '12:00',
      DataInicio2: '2026-09-02', InicioHora2: '08:00', FinalHora2: '10:30',
      DataInicio3: '2026-09-03', InicioHora3: '13:00', FinaHora3: '14:00',
    });
    expect(r.map((d) => [d.data, d.horas])).toEqual([['2026-09-01', 4], ['2026-09-02', 2.5], ['2026-09-03', 1]]);
  });
  it('dia sem horário recebe o que sobra do total, dividido', () => {
    const r = diasDoRelatorio({
      TecResp1: 'Pedro Motta', TotalHora: '6h',
      DataInicio: '2026-09-01', InicioHora: '08:00', FinalHora: '10:00',
      DataInicio2: '2026-09-02', InicioHora2: '', FinalHora2: '',
      DataInicio3: '2026-09-03',
    });
    expect(r.map((d) => d.horas)).toEqual([2, 2, 2]);
  });
  it('sem data nenhuma → nada; sem técnico → "Sem técnico"', () => {
    expect(diasDoRelatorio({ TecResp1: 'X', DataInicio: '' })).toEqual([]);
    expect(diasDoRelatorio({ DataInicio: '2026-09-01', InicioHora: '08:00', FinalHora: '09:00' })[0].tecnico).toBe('Sem técnico');
  });
});
