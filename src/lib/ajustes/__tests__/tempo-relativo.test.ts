import { describe, it, expect } from 'vitest';
import { tempoRelativo } from '../tempo-relativo';

const agora = new Date('2026-09-30T12:30:00Z');

describe('tempoRelativo', () => {
  it('sem registro', () => {
    expect(tempoRelativo(null, agora)).toEqual({ texto: 'sem registro de sincronização', nivel: 'desconhecido', horas: null });
    expect(tempoRelativo('lixo', agora).nivel).toBe('desconhecido');
  });

  it('timestamp sem fuso do cp_sync_log é lido como UTC', () => {
    const r = tempoRelativo('2026-09-30T10:05:17.434', agora);
    expect(r.texto).toBe('há 2 h');
    expect(r.nivel).toBe('ok');
  });

  it('minutos e "agora mesmo"', () => {
    expect(tempoRelativo('2026-09-30T12:29:40Z', agora).texto).toBe('agora mesmo');
    expect(tempoRelativo('2026-09-30T12:05:00Z', agora).texto).toBe('há 25 min');
  });

  it('níveis por limiar (4 h atenção, 9 h crítico)', () => {
    expect(tempoRelativo('2026-09-30T08:00:00Z', agora).nivel).toBe('atencao'); // 4,5 h
    expect(tempoRelativo('2026-09-30T03:00:00Z', agora).nivel).toBe('critico'); // 9,5 h
  });

  it('dias', () => {
    const r = tempoRelativo('2026-09-27T12:00:00Z', agora);
    expect(r.texto).toBe('há 3 dias');
    expect(r.nivel).toBe('critico');
  });

  it('futuro (relógio adiantado) não fica negativo', () => {
    expect(tempoRelativo('2026-09-30T13:00:00Z', agora).texto).toBe('agora mesmo');
  });
});
