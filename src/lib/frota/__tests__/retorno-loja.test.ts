import { describe, expect, it } from 'vitest';
import { estimarRetorno, velocidadeMedia, type PontoDia } from '../retorno-loja';

const LOJA = { lat: -23.2085, lng: -49.371 };
const t0 = Date.parse('2026-10-15T11:00:00Z');
// trajeto reto para o sul: 0,01° de latitude ≈ 1,11 km
const ponto = (min: number, km: number, vel = 60, lng = LOJA.lng): PontoDia => ({
  dt: new Date(t0 + min * 60_000).toISOString(), lat: LOJA.lat - km / 111.2, lng, vel,
});

/** Sai da loja, vai até `kmLonge` a 60 km/h, para 30 min e volta pelo mesmo caminho até `kmAgora`. */
function idaEVolta(kmLonge: number, kmAgora: number, velVolta = 60): PontoDia[] {
  const out: PontoDia[] = [ponto(0, 0, 0)];
  let min = 1;
  for (let km = 1; km <= kmLonge; km++) out.push(ponto(min++, km)); // 1 km por min = 60 km/h
  for (let i = 0; i < 30; i++) out.push(ponto(min++, kmLonge, 0));
  const passo = velVolta / 60;
  for (let km = kmLonge - passo; km >= kmAgora; km -= passo) out.push(ponto(min++, km, velVolta));
  return out;
}

describe('estimarRetorno', () => {
  it('refazendo o caminho da ida: km do trajeto e velocidade que fez nele', () => {
    const r = estimarRetorno(idaEVolta(30, 12), LOJA)!;
    expect(r.mesmoCaminho).toBe(true);
    expect(r.confianca).toBe('alta');
    expect(r.kmRestante).toBeCloseTo(12, 0);
    expect(r.kmh).toBe(60);
    expect(r.min).toBe(12);
    expect(Date.parse(r.eta) - Date.parse(idaEVolta(30, 12).at(-1)!.dt)).toBe(12 * 60_000);
  });

  it('indo embora da loja não é volta', () => {
    const ida: PontoDia[] = [ponto(0, 0, 0)];
    for (let km = 1; km <= 20; km++) ida.push(ponto(km, km));
    expect(estimarRetorno(ida, LOJA)).toBeNull();
  });

  it('parado ou já na loja não tem previsão', () => {
    const pts = idaEVolta(30, 12);
    pts.push({ ...pts.at(-1)!, dt: new Date(Date.parse(pts.at(-1)!.dt) + 60_000).toISOString(), vel: 0 });
    expect(estimarRetorno(pts, LOJA)).toBeNull();
    const chegando = idaEVolta(30, 1);
    chegando.push(ponto(Math.round((Date.parse(chegando.at(-1)!.dt) - t0) / 60_000) + 1, 0.3));
    expect(estimarRetorno(chegando, LOJA)).toBeNull();
  });

  it('chegando por outro caminho: linha reta × curvas, marcado como aproximado', () => {
    // começou o dia fora da loja (sem ida registrada), vindo do sul em linha reta
    const pts: PontoDia[] = [];
    for (let m = 0; m <= 25; m++) pts.push(ponto(m, 40 - m, 60, LOJA.lng));
    const r = estimarRetorno(pts, LOJA)!;
    expect(r.mesmoCaminho).toBe(false);
    expect(r.confianca).toBe('media');
    expect(r.kmRestante).toBeCloseTo(15 * 1.3, 0);
  });

  it('aproximando de lado (cliente na direção da loja) não conta fora do caminho da ida', () => {
    // anda para leste a 10 km ao sul da loja: a distância cai bem menos que o deslocamento
    const pts: PontoDia[] = [];
    for (let m = 0; m <= 25; m++) pts.push(ponto(m, 10, 60, LOJA.lng - 0.16 + m * 0.006));
    expect(estimarRetorno(pts, LOJA)).toBeNull();
  });
});

describe('velocidadeMedia', () => {
  it('só conta trechos andando', () => {
    // o minuto em que encosta para parar conta como andando a 0 km: um pouco abaixo de 60
    expect(velocidadeMedia(idaEVolta(20, 5))).toBeGreaterThan(55);
    expect(velocidadeMedia(idaEVolta(20, 5))).toBeLessThanOrEqual(60.1);
    expect(velocidadeMedia([ponto(0, 1, 0), ponto(1, 1, 0)])).toBeNull();
  });
});
