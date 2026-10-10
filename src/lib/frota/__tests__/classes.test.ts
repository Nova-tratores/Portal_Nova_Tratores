import { describe, it, expect } from 'vitest';
import { classeDaPendencia, resumoClasses, ordenarPorClasse, statusParado } from '../classes';

const comps = new Map([
  ['c-freio', { sistema: 'Freios' }],
  ['c-outros', { sistema: 'Outros' }],
]);

describe('classeDaPendencia', () => {
  it('crítica é sempre "parado", mesmo vinda do cadastro', () => {
    expect(classeDaPendencia({ origem: 'checklist', gravidade: 'critica' })).toBe('parado');
    expect(classeDaPendencia({ origem: 'cadastro', gravidade: 'critica' })).toBe('parado');
  });
  it('régua da Ficha é cadastro; o resto é defeito', () => {
    expect(classeDaPendencia({ origem: 'cadastro', componente_id: 'c-outros' }, comps)).toBe('cadastro');
    expect(classeDaPendencia({ origem: 'requisicao', componente_id: 'c-freio' }, comps)).toBe('defeito');
    expect(classeDaPendencia({ origem: 'manual' })).toBe('defeito');
  });
});

describe('resumoClasses', () => {
  it('conta por classe e diz o pior', () => {
    const r = resumoClasses([
      { origem: 'cadastro' }, { origem: 'cadastro' }, { origem: 'checklist', componente_id: 'c-freio' },
    ], 'ativo', comps);
    expect(r).toMatchObject({ parado: false, defeitos: 1, cadastro: 2, criticas: 0, pior: 'defeito', piorGravidade: 'grave' });
  });
  it('parado pela Ficha (status) mesmo sem pendência crítica', () => {
    const r = resumoClasses([], 'manutencao');
    expect(r.parado).toBe(true);
    expect(r.motivoParado).toEqual(['status']);
    expect(r.pior).toBe('parado');
  });
  it('sem nada aberto → pior null', () => {
    expect(resumoClasses([], 'ativo').pior).toBeNull();
    expect(statusParado('ativo')).toBe(false);
  });
});

describe('ordenarPorClasse', () => {
  it('parado, depois defeito por gravidade, depois cadastro', () => {
    const l = ordenarPorClasse([
      { id: 'a', origem: 'cadastro' },
      { id: 'b', origem: 'manual', gravidade: 'leve' },
      { id: 'c', origem: 'manual', gravidade: 'critica' },
      { id: 'd', origem: 'manual', gravidade: 'grave' },
    ]);
    expect(l.map((x) => x.id)).toEqual(['c', 'd', 'b', 'a']);
  });
});
