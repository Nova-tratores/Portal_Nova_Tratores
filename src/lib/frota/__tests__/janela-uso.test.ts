// Dia de uso do carro: a madrugada estacionada (sinal de 10 em 10 min com a
// ignição desligada) não é "saiu 00:08" nem "parou 7h17min".
import { describe, it, expect } from 'vitest';
import { janelaDeUso, paradasNoUso } from '../ignicao';

const p = (hhmm: string, ignicao: number, vel = 0) => ({ dt: `2026-10-20T${hhmm}:00.000Z`, ignicao, vel });

describe('janela de uso do dia', () => {
  const pontos = [p('03:08', 0), p('03:18', 0), p('10:25', 1, 0), p('10:30', 1, 60), p('19:40', 1, 0), p('19:41', 0), p('23:50', 0)];

  it('vai da 1ª vez ligado até o desligamento depois da última', () => {
    expect(janelaDeUso(pontos)).toEqual({ inicio: '2026-10-20T10:25:00.000Z', fim: '2026-10-20T19:41:00.000Z' });
  });

  it('a parada da madrugada e a da noite saem; as do dia ficam', () => {
    const paradas = [
      { inicio: '2026-10-20T03:08:00.000Z', duracao_min: 437 },
      { inicio: '2026-10-20T12:00:00.000Z', duracao_min: 17 },
      { inicio: '2026-10-20T19:41:00.000Z', duracao_min: 250 },
    ];
    expect(paradasNoUso(paradas, janelaDeUso(pontos)).map((x) => x.duracao_min)).toEqual([17]);
  });

  it('carro que não saiu não tem janela; sem ignição usa a velocidade', () => {
    expect(janelaDeUso([p('03:00', 0), p('12:00', 0)])).toEqual({ inicio: null, fim: null });
    const semIgn = [{ dt: '2026-10-20T08:00:00Z', ignicao: 0, vel: 0 }, { dt: '2026-10-20T09:00:00Z', ignicao: 0, vel: 40 }, { dt: '2026-10-20T10:00:00Z', ignicao: 0, vel: 50 }];
    expect(janelaDeUso(semIgn)).toEqual({ inicio: '2026-10-20T09:00:00Z', fim: '2026-10-20T10:00:00Z' });
  });
});
