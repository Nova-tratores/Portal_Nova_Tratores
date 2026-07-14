import { describe, it, expect } from 'vitest';
import { agregarIgnicao, type PontoIgnicao } from '../ignicao';

// helper: pontos a cada 1 min a partir de 08:00
const seq = (specs: [number, number][]): PontoIgnicao[] =>
  specs.map(([ignicao, vel], i) => ({
    dt: new Date(Date.UTC(2026, 6, 1, 8, i)).toISOString(),
    ignicao,
    vel,
  }));

describe('agregarIgnicao', () => {
  it('dia vazio', () => {
    const m = agregarIgnicao([]);
    expect(m.partidas).toBe(0);
    expect(m.tempo_ligado_min).toBe(0);
  });

  it('um ciclo simples: liga, roda, para no semáforo, desliga', () => {
    // 0-2 desligado · 3 liga parado · 4-6 rodando · 7 parado ligado · 8 desliga
    const m = agregarIgnicao(seq([
      [0, 0], [0, 0], [0, 0],
      [1, 0],
      [1, 40], [1, 50], [1, 30],
      [1, 0],
      [0, 0],
    ]));
    expect(m.partidas).toBe(1);
    expect(m.ja_ligado_no_inicio).toBe(false);
    expect(m.tempo_ligado_min).toBe(5);        // min 3..8 ligado
    expect(m.tempo_movimento_min).toBe(3);     // min 4,5,6
    expect(m.tempo_marcha_lenta_min).toBe(2);  // ligado − movimento
    expect(m.vel_max).toBe(50);
    expect(m.ultimo_desligamento).not.toBeNull();
  });

  it('flicker do rastreador (religou em <2min) NÃO conta partida nova', () => {
    // liga · desliga 1min · religa (flicker) · segue
    const m = agregarIgnicao(seq([
      [0, 0], [1, 10], [0, 0], [1, 10], [1, 20],
    ]));
    expect(m.partidas).toBe(1); // só a primeira
  });

  it('religou DEPOIS do debounce conta como segunda partida', () => {
    const pontos: PontoIgnicao[] = [
      { dt: '2026-07-01T08:00:00Z', ignicao: 0, vel: 0 },
      { dt: '2026-07-01T08:01:00Z', ignicao: 1, vel: 10 }, // 1ª partida
      { dt: '2026-07-01T08:10:00Z', ignicao: 0, vel: 0 },  // desligou
      { dt: '2026-07-01T09:00:00Z', ignicao: 1, vel: 10 }, // 50min depois: 2ª
    ];
    expect(agregarIgnicao(pontos).partidas).toBe(2);
  });

  it('1º fix do dia já ligado: flag sim, partida não (seria inflar)', () => {
    const m = agregarIgnicao(seq([[1, 30], [1, 40], [0, 0]]));
    expect(m.ja_ligado_no_inicio).toBe(true);
    expect(m.partidas).toBe(0);
    expect(m.tempo_ligado_min).toBe(2);
  });

  it('gap de sinal é capado em 15min (não afirma estado do motor)', () => {
    const pontos: PontoIgnicao[] = [
      { dt: '2026-07-01T08:00:00Z', ignicao: 1, vel: 40 },
      { dt: '2026-07-01T10:00:00Z', ignicao: 1, vel: 40 }, // 2h de buraco
      { dt: '2026-07-01T10:01:00Z', ignicao: 0, vel: 0 },
    ];
    const m = agregarIgnicao(pontos);
    expect(m.tempo_ligado_min).toBe(16); // 15 (capado) + 1
  });

  it('marcha lenta: motor ligado a manhã toda sem sair do lugar', () => {
    const m = agregarIgnicao(seq(Array.from({ length: 31 }, (_, i) => (i === 0 ? [0, 0] : [1, 0]) as [number, number])));
    expect(m.tempo_ligado_min).toBe(29);
    expect(m.tempo_movimento_min).toBe(0);
    expect(m.tempo_marcha_lenta_min).toBe(29); // dinheiro queimando parado
  });

  it('pontos fora de ordem são ordenados', () => {
    const pontos: PontoIgnicao[] = [
      { dt: '2026-07-01T08:02:00Z', ignicao: 1, vel: 20 },
      { dt: '2026-07-01T08:00:00Z', ignicao: 0, vel: 0 },
      { dt: '2026-07-01T08:01:00Z', ignicao: 1, vel: 10 },
    ];
    const m = agregarIgnicao(pontos);
    expect(m.partidas).toBe(1);
    expect(m.tempo_ligado_min).toBe(1);
  });
});
