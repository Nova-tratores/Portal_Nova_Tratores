import { describe, it, expect } from 'vitest';
import { novoBuffer, acumular, marcarPresenca, drenar, devolver, tamanho } from './buffer';

describe('buffer de uso', () => {
  it('soma na mesma chave e separa tipos', () => {
    const b = novoBuffer();
    acumular(b, { tipo: 'pagina', user_id: 'u1', rota: '/pos', dia: '2026-10-07' });
    acumular(b, { tipo: 'pagina', user_id: 'u1', rota: '/pos', dia: '2026-10-07' });
    acumular(b, { tipo: 'api', user_id: 'u1', rota: '/api/pos/ordens', dia: '2026-10-07', n: 3 });
    acumular(b, { tipo: 'pagina', user_id: 'u1', rota: '', dia: '2026-10-07' }); // ignorada
    const lote = drenar(b);
    expect(lote.itens).toHaveLength(2);
    expect(lote.itens.find((i) => i.tipo === 'pagina')?.n).toBe(2);
    expect(lote.itens.find((i) => i.tipo === 'api')?.n).toBe(3);
    expect(tamanho(b)).toBe(0);
  });
  it('presença guarda a última rota por usuário', () => {
    const b = novoBuffer();
    marcarPresenca(b, 'u1', '/pos', new Date('2026-10-07T10:00:00Z'));
    marcarPresenca(b, 'u1', '/ppv', new Date('2026-10-07T10:01:00Z'));
    const lote = drenar(b);
    expect(lote.presenca).toEqual([{ user_id: 'u1', rota: '/ppv', em: '2026-10-07T10:01:00.000Z' }]);
  });
  it('devolver re-soma sem perder o que entrou depois', () => {
    const b = novoBuffer();
    acumular(b, { tipo: 'pagina', user_id: 'u1', rota: '/pos', dia: '2026-10-07', n: 2 });
    const lote = drenar(b);
    acumular(b, { tipo: 'pagina', user_id: 'u1', rota: '/pos', dia: '2026-10-07' });
    devolver(b, lote);
    expect(drenar(b).itens[0].n).toBe(3);
  });
});

describe('transições', () => {
  it('acumula, ignora de === para e devolve sem perder', async () => {
    const { acumularTransicao, drenarTransicoes, devolverTransicoes } = await import('./buffer');
    const m = new Map();
    const base = { user_id: 'u', de: '/a', para: '/b', dia: '2026-10-17' };
    acumularTransicao(m, { ...base, gapS: 30, mesmoAlvo: true, volta: false });
    acumularTransicao(m, { ...base, gapS: 120, mesmoAlvo: false, volta: true });
    acumularTransicao(m, { ...base, para: '/a', gapS: 1, mesmoAlvo: true, volta: true });
    const lote = drenarTransicoes(m);
    expect(lote).toEqual([{ ...base, n: 2, n_mesmo_alvo: 1, n_volta: 1, n_rapida: 1, soma_gap_s: 150 }]);
    expect(m.size).toBe(0);
    devolverTransicoes(m, lote);
    devolverTransicoes(m, lote);
    expect(drenarTransicoes(m)[0].n).toBe(4);
  });
});
