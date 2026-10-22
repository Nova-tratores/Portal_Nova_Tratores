// Território gamificado: nível de cada imóvel do CAR pela conquista do vendedor.
import { describe, it, expect } from 'vitest';
import { nivelDoImovel, resumoTerritorio, geometriaLeve, bboxVazio } from '../territorio';

const v = (id: number, prop: number | null = 1) => ({ id, cod_car: 'X', dia: '2026-10-20', vendedor_id: 7, propriedade_id: prop });

describe('nível do imóvel', () => {
  it('sem visita é bloqueado; 1 visita visitado; 2+ em conversa', () => {
    expect(nivelDoImovel([], [])).toBe('bloqueado');
    expect(nivelDoImovel([v(1)], [])).toBe('visitado');
    expect(nivelDoImovel([v(1), v(2)], [])).toBe('conversa');
  });
  it('negócio aberto esquenta; quente fica escuro; ganho vira dourado; perdido não conta', () => {
    expect(nivelDoImovel([v(1)], [{ propriedade_id: 1, status: 'andamento', temperatura: 'morno' }])).toBe('conversa');
    expect(nivelDoImovel([v(1)], [{ propriedade_id: 1, status: 'apresentacao_proposta', temperatura: 'quente' }])).toBe('quente');
    expect(nivelDoImovel([v(1)], [{ propriedade_id: 1, status: 'fechamento_positivo', temperatura: null }])).toBe('cliente');
    expect(nivelDoImovel([v(1)], [{ propriedade_id: 1, status: 'fechamento_negativo', temperatura: 'quente' }])).toBe('visitado');
    expect(nivelDoImovel([v(1)], [{ propriedade_id: 2, status: 'andamento', temperatura: 'quente' }])).toBe('visitado');
  });
});

describe('resumo do território', () => {
  it('conta imóveis e área desbloqueada', () => {
    const r = resumoTerritorio(['bloqueado', 'visitado', 'quente', 'bloqueado'], [100, 50, 30, 20]);
    expect(r).toMatchObject({ total: 4, desbloqueados: 2, pct: 50, areaTotalHa: 200, areaDesbloqueadaHa: 80 });
    expect(r.contagem.quente).toBe(1);
  });
});

describe('desenho leve', () => {
  it('arredonda para ~1 m, tira ponto repetido e calcula o contorno', () => {
    const bbox = bboxVazio();
    const g = geometriaLeve({ type: 'Polygon', coordinates: [[[-49.1234567, -23.1], [-49.1234568, -23.1], [-49.2, -23.2], [-49.1234567, -23.1]]] }, bbox);
    expect(g.coordinates).toEqual([[[-49.12346, -23.1], [-49.2, -23.2], [-49.12346, -23.1]]]);
    expect(bbox).toEqual([-49.2, -23.2, -49.12346, -23.1]);
  });
});
