import { describe, it, expect } from 'vitest';
import { chaveDono, mesmoDonoEstrito, pinosProvaveis, type FonteLocal } from '../tratores-provaveis';

describe('localização provável do trator', () => {
  it('nome inteiro igual, sem acento e sem NETO/E OUTROS', () => {
    expect(chaveDono('João Batista Duarte Neto e Outro')).toBe('JOAO BATISTA DUARTE');
    expect(mesmoDonoEstrito('JOÃO BATISTA DUARTE NETO', 'João Batista Duarte Neto e Outro')).toBe(true);
    expect(mesmoDonoEstrito('ROSAN ANTONIO AIELLO', 'Rosan Antônio Aiello')).toBe(true);
  });
  it('nome longo aceita 1 letra de diferença', () => {
    expect(mesmoDonoEstrito('LAUDAIR JUVENCIO NATAL', 'Laudeir Juvêncio Natal')).toBe(true);
  });
  it('nome só parecido não casa', () => {
    expect(mesmoDonoEstrito('JOSÉ NUNES FILHO', 'José Afonso Gabriel Filho')).toBe(false);
    expect(mesmoDonoEstrito('VALMIR FERNANDES RIBEIRO', 'Roque Fernandes Ribeiro')).toBe(false);
    expect(mesmoDonoEstrito('JOSE SILVA', 'JOSE SILVA SANTOS')).toBe(false);
  });
  it('nome de lugar ou de uma palavra só não casa', () => {
    expect(mesmoDonoEstrito('FAZENDA BOA ESPERANÇA', 'Fazenda Boa Esperança')).toBe(false);
    expect(mesmoDonoEstrito('ADRIANOCORCOVIA', 'Adrianocorcovia')).toBe(false);
  });
  it('fazenda do técnico vence visita; entre visitas, a mais recente', () => {
    const fontes: FonteLocal[] = [
      { nomes: ['Laudeir Juvêncio Natal', 'Sítio São Jorge'], lat: 1, lng: 1, origem: 'visita', detalhe: 'visita de Pedro', quando: '2026-06-10' },
      { nomes: ['Laudeir Juvêncio Natal'], lat: 2, lng: 2, origem: 'visita', detalhe: 'visita de Matheus', quando: '2026-10-20' },
      { nomes: ['ROSAN ANTONIO AIELLO'], lat: 3, lng: 3, origem: 'visita', detalhe: null, quando: '2026-10-01' },
      { nomes: ['ROSAN ANTONIO AIELLO'], lat: 4, lng: 4, origem: 'fazenda', detalhe: 'técnico', quando: '2026-01-01' },
    ];
    const r = pinosProvaveis([
      { Chassis: 'MDI0751AAA005931', Modelo: '6075E', Cliente: 'LAUDAIR JUVENCIO NATAL' },
      { Chassis: 'X005279', Modelo: '6075', Cliente: 'ROSAN ANTONIO AIELLO' },
      { Chassis: 'Y1', Modelo: '9500', Cliente: 'FULANO DE TAL' },
    ], fontes);
    expect(r.map((p) => [p.cliente, p.lat])).toEqual([['LAUDAIR JUVENCIO NATAL', 2], ['ROSAN ANTONIO AIELLO', 4]]);
    expect(r[0].chassis_fim).toBe('005931');
  });
});

import { citaChassi } from '../tratores-provaveis';
describe('local do atendimento da OS (Pasta Cliente)', () => {
  it('casa pelo chassi citado na OS, mesmo com o trator em nome de parente', () => {
    const fontes: FonteLocal[] = [
      { nomes: ['PEDRO ALCANTARA RIBEIRO NETO E OUTRO'], textoChassi: '6075E CAB MDI07513PS0006206 revisão', lat: 9, lng: 9, origem: 'atendimento', detalhe: 'OS-0851', quando: '2026-10-30' },
      { nomes: ['Maria Beatriz Navarro Ribeiro Costacurta'], lat: 1, lng: 1, origem: 'visita', detalhe: null, quando: '2026-11-01' },
    ];
    const r = pinosProvaveis([{ Chassis: 'MDI07513PS0006206', Modelo: '6075E CAB', Cliente: 'MARIA BEATRIZ NAVARRO RIBEIRO COSTACURTA' }], fontes);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ origem: 'atendimento', lat: 9, detalhe: 'OS-0851' });
  });
  it('final de 7 do chassi, sem confundir quem só divide os 6 últimos', () => {
    expect(citaChassi('JIVO 2025 MBN1KCBFPGL00790', 'MBN1KGCBFPGL00790')).toBe(true);
    // caso real: o 6 últimos "000549" do 9500 do Olinto Jr aparecem dentro de "0005494" (7095 do Valmir)
    expect(citaChassi('7095 PLAT MDI09510JS0005494', 'MDI09524PJ0000549')).toBe(false);
    expect(citaChassi('7095 PLAT MDI09510JS0005494', 'MDI09510JS0005494')).toBe(true);
    expect(citaChassi('', 'MDI07513PS0006206')).toBe(false);
  });
  it('local de atendimento NÃO casa pelo nome (só pelo chassi)', () => {
    const r = pinosProvaveis([{ Chassis: 'OUTRO000001', Modelo: '9500', Cliente: 'PEDRO ALCANTARA RIBEIRO NETO' }],
      [{ nomes: ['PEDRO ALCANTARA RIBEIRO NETO'], textoChassi: 'MDI07513PS0006206', lat: 9, lng: 9, origem: 'atendimento', detalhe: null, quando: null }]);
    expect(r).toHaveLength(0);
  });
});
