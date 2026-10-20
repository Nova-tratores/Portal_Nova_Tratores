// Mapa do supervisor no app de vendas: carro de cada vendedor + timeline do dia.
import { describe, it, expect } from 'vitest';
import { carrosDosVendedores, montarTimeline, desenhoDaRota, type CarroVivoBase } from '../mapa-vendedores';

const carro = (placa: string, extra: Partial<CarroVivoBase> = {}): CarroVivoBase => ({
  placa, placa_exibicao: placa, modelo: '', motorista_hoje: null, responsavel: null,
  lat: -23.2, lng: -49.3, ignicao: false, velocidade: 0, dt: null, status: 'desligado', local: null, rumo: null, ...extra,
});

describe('carro de cada vendedor', () => {
  it('check-in de hoje vale mais que o responsável da Frota', () => {
    const r = carrosDosVendedores(
      [{ id: 28, nome: 'MATHEUS PARMEZAN' }, { id: 7, nome: 'LUCAS ENZ' }],
      [carro('SEB9J47', { responsavel: 'Matheus Parmezan' }), carro('EPX5406', { responsavel: 'Lucas Jose Bragança Enz', motorista_hoje: 'Matheus Parmezan' })],
    );
    expect(r.map((c) => [c.vendedor_id, c.placa])).toEqual([[28, 'EPX5406']]);
  });

  it('carro emprestado não volta para o responsável; vendedor sem carro some', () => {
    const r = carrosDosVendedores(
      [{ id: 28, nome: 'MATHEUS PARMEZAN' }, { id: 4, nome: 'PEDRO FAVARO' }],
      [carro('SEB9J47', { responsavel: 'Matheus Parmezan' })],
    );
    expect(r.map((c) => c.placa)).toEqual(['SEB9J47']);
  });
});

describe('timeline do dia', () => {
  const p = (min: number, lat: number, vel = 40) => ({ lat, lng: -49.3, dt: new Date(Date.UTC(2026, 9, 20, 10, min)).toISOString(), vel });
  const pontos = [p(0, -23.2), p(5, -23.22, 61), p(10, -23.24), p(40, -23.24, 0), p(45, -23.26), p(50, -23.28)];

  it('saída → trecho → parada → trecho → fim', () => {
    const evs = montarTimeline(pontos, [{ lat: -23.24, lng: -49.3, inicio: pontos[2].dt, fim: pontos[3].dt, duracao_min: 30, local: 'Cliente X' }], pontos[0].dt, pontos[5].dt);
    expect(evs.map((e) => e.tipo)).toEqual(['inicio', 'trecho', 'parada', 'trecho', 'fim']);
    const t = evs[1] as { km: number; velMax: number };
    expect(t.km).toBeGreaterThan(4);
    expect(t.velMax).toBe(61);
    expect((evs[2] as { local: string }).local).toBe('Cliente X');
  });

  it('dia sem pontos não tem timeline', () => {
    expect(montarTimeline([], [], null, null)).toEqual([]);
  });

  it('buraco de sinal vira conector, não linha', () => {
    const d = desenhoDaRota([p(0, -23.2), p(1, -23.201), p(2, -23.3), p(3, -23.301)]);
    expect(d.segmentos.length).toBe(2);
    expect(d.buracos.length).toBe(1);
  });
});
