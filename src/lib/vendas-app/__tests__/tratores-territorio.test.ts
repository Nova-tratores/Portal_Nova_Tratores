// Tratores vendidos no território: contagem por município e pinos dos localizados.
import { describe, it, expect } from 'vitest';
import { chaveMunicipio, tratoresDoMunicipio } from '../tratores-territorio';

describe('tratores no território', () => {
  it('casa a cidade em texto livre com o município', () => {
    expect(chaveMunicipio('AGUDOS FAZ SÃO DOMINGOS')).toBe('AGUDOS');
    expect(chaveMunicipio('Carlópolis (PR)')).toBe('CARLOPOLIS');
    expect(chaveMunicipio('Sta Cruz do Rio Pardo/SP')).toBe('SANTA CRUZ DO RIO PARDO');
  });

  it('conta os vendidos e põe pino só nos localizados do município', () => {
    const vendidos = [
      { Chassis: 'AAA111', Modelo: '6075', Cliente: 'Olinto', Cidade: 'CARLOPOLIS', Entrega: '01/01/2020' },
      { Chassis: 'BBB222', Modelo: '4530', Cliente: 'José', Cidade: 'Carlópolis (PR)', Entrega: '01/01/2021' },
      { Chassis: 'CCC333', Modelo: '4530', Cliente: 'Ana', Cidade: 'PIRAJU', Entrega: '01/01/2021' },
    ];
    const localizados = [
      { chassis: 'AAA111', lat: -23.4, lng: -49.7, cod_car: 'PR-1', confirmado_em: '2026-10-22', vendedor_nome: 'Matheus' },
      { chassis: 'CCC333', lat: -23.2, lng: -49.3, cod_car: 'SP-9', confirmado_em: '2026-10-22', vendedor_nome: 'Lucas' },
    ];
    const r = tratoresDoMunicipio('Carlópolis', vendidos, localizados, new Set(['PR-1']));
    expect(r.vendidos).toBe(2);
    expect(r.localizados).toBe(1);
    expect(r.pinos.map((p) => p.chassis_fim)).toEqual(['AAA111']);
    expect(r.pinos[0]).toMatchObject({ modelo: '6075', cliente: 'Olinto' });
  });
});
