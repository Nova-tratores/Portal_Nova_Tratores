import { describe, expect, it } from 'vitest';
import { estimar, extrairViagens, fmtMin, modeloDistancia, semForaDaCurva, type ParadaHist } from '../tempo-loja';

const LOJA = { lat: -23.2085, lng: -49.371 };
const FAZ = { lat: -23.3, lng: -49.45 }; // ~13 km da loja

// parada no dia 15/10 às hh:mm (horário fixo em UTC para o teste)
const p = (placa: string, ini: string, fim: string | null, lugar: { lat: number; lng: number }, classe: string): ParadaHist => ({
  placa, inicio: `2026-10-15T${ini}:00Z`, fim: fim ? `2026-10-15T${fim}:00Z` : null, latitude: lugar.lat, longitude: lugar.lng, classe,
});

describe('extrairViagens', () => {
  it('ida = sai da loja até a próxima parada; volta = da última parada até a loja', () => {
    const v = extrairViagens([
      p('A', '07:00', '08:00', LOJA, 'loja'),
      p('A', '08:30', '10:00', FAZ, 'cliente_portal'), // ida: 30 min
      p('A', '10:40', '12:00', LOJA, 'loja'),          // volta: 40 min
    ], LOJA);
    expect(v.map((x) => [x.sentido, Math.round(x.min)])).toEqual([['ida', 30], ['volta', 40]]);
  });

  it('ignora loja→loja, pontos colados na loja, GPS impossível e viagem de mais de 6 h', () => {
    const v = extrairViagens([
      p('B', '07:00', '07:30', LOJA, 'loja'),
      p('B', '07:40', '08:00', { lat: -23.209, lng: -49.3712 }, 'fora_geocerca'), // < 1 km
      p('B', '08:10', '09:00', LOJA, 'loja'),
      p('B', '09:02', '10:00', FAZ, 'cliente_portal'), // 13 km em 2 min = GPS errado
      p('B', '10:10', '10:20', LOJA, 'loja'),
      p('B', '18:00', '19:00', FAZ, 'cliente_portal'), // 7h40 depois = não é viagem
    ], LOJA);
    expect(v).toEqual([expect.objectContaining({ sentido: 'volta' })]);
  });
});

describe('semForaDaCurva', () => {
  it('tira os valores muito acima ou abaixo dos quartis', () => {
    expect(semForaDaCurva([30, 32, 31, 29, 33, 150])).toEqual([29, 30, 31, 32, 33]);
  });
  it('com menos de 4 valores mantém todos', () => {
    expect(semForaDaCurva([30, 150])).toEqual([30, 150]);
  });
});

describe('estimar', () => {
  const viagens = [30, 32, 31, 29, 150].map((min) => ({ sentido: 'ida' as const, lat: FAZ.lat + 0.001, lng: FAZ.lng, min, kmReto: 13 }));
  it('usa a mediana das viagens perto do ponto, sem as fora da curva', () => {
    const e = estimar(FAZ, LOJA, viagens, 'ida', null);
    expect(e).toEqual({ min: 31, viagens: 4, descartadas: 1, fonte: 'historico' });
  });
  it('poucas viagens: a que levou mais de 2,5x o esperado sai, mesmo sem quartis', () => {
    const tres = [16, 18, 94].map((min) => ({ sentido: 'volta' as const, lat: FAZ.lat, lng: FAZ.lng, min, kmReto: 13 }));
    const e = estimar(FAZ, LOJA, tres, 'volta', { fixo: 5, porKm: 1 });
    expect(e).toEqual({ min: 17, viagens: 2, descartadas: 1, fonte: 'historico' });
  });
  it('sem viagens por perto, estima pela distância com o modelo da frota', () => {
    const e = estimar({ lat: -23.5, lng: -49.9 }, LOJA, viagens, 'volta', { fixo: 10, porKm: 1.2 });
    expect(e.fonte).toBe('distancia');
    // ~63 km em linha reta: 10 + 1,2 × 63 ≈ 86 min
    expect(e.min).toBeGreaterThan(80);
    expect(e.min).toBeLessThan(92);
  });
  it('sem histórico nenhum', () => {
    expect(estimar(FAZ, LOJA, [], 'ida', null).fonte).toBe('sem_dados');
  });
});

describe('modeloDistancia e fmtMin', () => {
  it('ajusta fixo + minutos por km (viagem longa não herda o ritmo da curta)', () => {
    const vs = [[5, 15], [10, 20], [20, 30], [40, 50], [80, 90]].map(([km, min]) => ({ sentido: 'ida' as const, lat: 0, lng: 0, min, kmReto: km }));
    const m = modeloDistancia(vs)!;
    expect(Math.round(m.fixo)).toBe(10);
    expect(m.porKm).toBeCloseTo(1, 5);
  });
  it('com poucas viagens não monta modelo', () => {
    expect(modeloDistancia([{ sentido: 'ida', lat: 0, lng: 0, min: 26, kmReto: 13 }])).toBeNull();
  });
  it('formata', () => {
    expect(fmtMin(42)).toBe('42 min');
    expect(fmtMin(65)).toBe('1h05');
    expect(fmtMin(null)).toBe('—');
  });
});
