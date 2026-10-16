import { describe, expect, it } from 'vitest';
import { agruparPorProximidade, contarPorStatus, diaBR, haQuanto, limparNome, ordenarVivos, statusVivo } from '../mapa-vivo';

const AGORA = new Date('2026-10-15T15:00:00Z').getTime();
const ha = (min: number) => new Date(AGORA - min * 60000).toISOString();

describe('statusVivo', () => {
  it('motor ligado e andando', () => {
    expect(statusVivo({ ignicao: true, velocidade: 60, dt: ha(1) }, AGORA)).toBe('andando');
  });
  it('motor ligado parado (abaixo de 5 km/h)', () => {
    expect(statusVivo({ ignicao: true, velocidade: 2, dt: ha(10) }, AGORA)).toBe('ligado_parado');
  });
  it('motor ligado sem posição há mais de 1 h = sem sinal', () => {
    expect(statusVivo({ ignicao: true, velocidade: 60, dt: ha(59) }, AGORA)).toBe('andando');
    expect(statusVivo({ ignicao: true, velocidade: 60, dt: ha(61) }, AGORA)).toBe('sem_sinal');
  });
  it('desligado até 24 h; depois sem sinal', () => {
    expect(statusVivo({ ignicao: false, velocidade: 0, dt: ha(23 * 60) }, AGORA)).toBe('desligado');
    expect(statusVivo({ ignicao: false, velocidade: 0, dt: ha(25 * 60) }, AGORA)).toBe('sem_sinal');
  });
  it('sem posição nenhuma = sem sinal', () => {
    expect(statusVivo(null, AGORA)).toBe('sem_sinal');
    expect(statusVivo({ ignicao: false, velocidade: 0, dt: null }, AGORA)).toBe('sem_sinal');
  });
});

describe('haQuanto', () => {
  it('formata a idade da posição', () => {
    expect(haQuanto(ha(1), AGORA)).toBe('agora');
    expect(haQuanto(ha(7), AGORA)).toBe('há 7 min');
    expect(haQuanto(ha(190), AGORA)).toBe('há 3 h');
    expect(haQuanto(ha(3 * 24 * 60), AGORA)).toBe('há 3 dias');
    expect(haQuanto(null, AGORA)).toBe('sem posição');
  });
});

describe('diaBR', () => {
  it('depois das 21h de Brasília ainda é hoje (UTC já virou o dia)', () => {
    expect(diaBR(new Date('2026-10-16T01:30:00Z'))).toBe('2026-10-15');
    expect(diaBR(new Date('2026-10-15T03:30:00Z'))).toBe('2026-10-15');
  });
});

describe('limparNome', () => {
  it('lixo de cadastro vira nulo', () => {
    expect(limparNome('Vazio')).toBeNull();
    expect(limparNome('  ')).toBeNull();
    expect(limparNome(null)).toBeNull();
  });
  it('tira o caixa alta e mantém o que já está escrito normal', () => {
    expect(limparNome('NICOLAS DARIO')).toBe('Nicolas Dario');
    expect(limparNome('DANILO DE SOUZA')).toBe('Danilo de Souza');
    expect(limparNome('Lucas Jose Bragança Enz')).toBe('Lucas Jose Bragança Enz');
  });
});

describe('agruparPorProximidade', () => {
  it('junta carros no mesmo pátio e separa os distantes; ignora sem posição', () => {
    const g = agruparPorProximidade([
      { id: 'a', lat: -23.2085, lng: -49.371 },
      { id: 'b', lat: -23.2086, lng: -49.3711 }, // ~15 m do a
      { id: 'c', lat: -23.3, lng: -49.5 },       // longe
      { id: 'd', lat: null, lng: null },
    ]);
    expect(g.map((x) => x.map((v) => v.id))).toEqual([['a', 'b'], ['c']]);
  });
});

describe('ordenar e contar', () => {
  const l = [
    { placa: 'B', nome: 'Zé', status: 'sem_sinal' as const },
    { placa: 'A', nome: 'Ana', status: 'desligado' as const },
    { placa: 'C', nome: null, status: 'andando' as const },
    { placa: 'D', nome: 'Bia', status: 'desligado' as const },
  ];
  it('andando primeiro, sem sinal por último', () => {
    expect(ordenarVivos(l).map((x) => x.placa)).toEqual(['C', 'A', 'D', 'B']);
  });
  it('conta por situação', () => {
    expect(contarPorStatus(l)).toEqual({ andando: 1, ligado_parado: 0, desligado: 2, sem_sinal: 1 });
  });
});
