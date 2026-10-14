import { describe, it, expect, beforeEach } from 'vitest';
import { esperaDepois, podeConsultar, registrarConsulta, escolherDaVez, _limparFila, ESPERA_MAX_MS } from '../sync-recente-fila';

const MIN = 60_000;

beforeEach(() => _limparFila());

describe('fila das notas da Pasta do cliente', () => {
  it('espera dobra a cada tentativa até 6 h', () => {
    expect(esperaDepois(0)).toBe(0);
    expect(esperaDepois(1)).toBe(5 * MIN);
    expect(esperaDepois(2)).toBe(10 * MIN);
    expect(esperaDepois(3)).toBe(20 * MIN);
    expect(esperaDepois(20)).toBe(ESPERA_MAX_MS);
  });

  it('item sem nota espera; com nota sai da fila', () => {
    const t0 = 1_000_000;
    expect(podeConsultar('os:1', t0)).toBe(true);
    registrarConsulta('os:1', false, t0);
    expect(podeConsultar('os:1', t0 + 4 * MIN)).toBe(false);
    expect(podeConsultar('os:1', t0 + 5 * MIN)).toBe(true);
    registrarConsulta('os:1', false, t0 + 5 * MIN);
    expect(podeConsultar('os:1', t0 + 14 * MIN)).toBe(false);
    registrarConsulta('os:1', true, t0 + 15 * MIN);
    expect(podeConsultar('os:1', t0 + 15 * MIN)).toBe(true);
  });

  it('escolhe no máximo N, pulando os que estão esperando, na ordem recebida', () => {
    const t0 = 1_000_000;
    registrarConsulta('2', false, t0);
    const itens = ['1', '2', '3', '4', '5'];
    expect(escolherDaVez(itens, (x) => x, t0, 3)).toEqual(['1', '3', '4']);
  });
});
