import { describe, it, expect } from 'vitest';
import { qtdPaga, pagoDaGarantia, novosValoresPagos, lerHoras } from '../pago-fabrica';

const MAHINDRA = { hora: 121, km: 2.1 };

describe('qtdPaga', () => {
  it('usa o que foi informado e calcula as recusadas', () => {
    expect(qtdPaga(2, 1, 121, 121)).toEqual({ pedidas: 2, pagas: 1, recusadas: 1, informado: true });
  });
  it('sem informar, deduz do valor pago ÷ taxa', () => {
    expect(qtdPaga(2, null, 242, 121)).toEqual({ pedidas: 2, pagas: 2, recusadas: 0, informado: false });
  });
  it('pagou mais que o pedido não vira recusa negativa', () => {
    expect(qtdPaga(1, 3, 0, 121).recusadas).toBe(0);
  });
});

describe('pagoDaGarantia', () => {
  it('pedidas = garantista, senão técnico', () => {
    const p = pagoDaGarantia({ tecnico_horas: 3, garantista_horas: 2, tecnico_km: 100, fabrica_horas_pagas: 1, valor_pago_km: 214.2 }, MAHINDRA);
    expect(p.horas).toMatchObject({ pedidas: 2, pagas: 1, recusadas: 1 });
    expect(p.km).toMatchObject({ pedidas: 100, pagas: 102, recusadas: 0 });
  });
});

describe('novosValoresPagos', () => {
  it('refaz M.O. e km com a taxa e mantém as peças no total', () => {
    // GAR-0062: 2 h / 102 km gravados a 193/2,80; a DRVG pagou 1 h e 102 km
    expect(novosValoresPagos({ valor_pago_horas: 386, valor_pago_km: 285.6, valor_pago_total: 671.6 }, 1, 102, MAHINDRA))
      .toEqual({ valor_pago_horas: 121, valor_pago_km: 214.2, valor_pago_total: 335.2 });
    expect(novosValoresPagos({ valor_pago_horas: 0, valor_pago_km: 0, valor_pago_total: 500 }, 0.33, 0, MAHINDRA).valor_pago_total).toBe(539.93);
  });
});

describe('lerHoras', () => {
  it('aceita 1:30, 0:20, 1,5 e 1.5', () => {
    expect(lerHoras('1:30')).toBe(1.5);
    expect(lerHoras('0:20')).toBe(0.33);
    expect(lerHoras('1,5')).toBe(1.5);
    expect(lerHoras('1.5')).toBe(1.5);
    expect(lerHoras('abc')).toBeNull();
    expect(lerHoras('')).toBeNull();
  });
});
