import { describe, it, expect } from 'vitest';
import { assinaturaLinha, planejarEspelho, decidirModo, dataOmie, type LinhaEspelho } from '../caracteristicas-diff';

const L = (id: number, car: Record<string, string>, desc = 'PECA'): LinhaEspelho =>
  ({ conta_omie: 'NOVA', codigo_produto: id, codigo: `C${id}`, descricao: desc, caracteristicas: car });

describe('assinatura', () => {
  it('não depende da ordem das características', () => {
    expect(assinaturaLinha(L(1, { a: '1', b: '2' }))).toBe(assinaturaLinha(L(1, { b: '2', a: '1' })));
    expect(assinaturaLinha(L(1, { a: '1' }))).not.toBe(assinaturaLinha(L(1, { a: '2' })));
  });
});

describe('planejarEspelho', () => {
  const existentes = [L(1, { '#PRATELEIRA': '1' }), L(2, { Tipo: 'Filtro' }), L(3, {})];

  it('completo: grava só novas e alteradas, apaga as que sumiram', () => {
    const novas = [L(1, { '#PRATELEIRA': '1' }), L(2, { Tipo: 'Óleo' }), L(4, {})];
    const p = planejarEspelho(novas, existentes, 'completo');
    expect(p.gravar.map((x) => x.codigo_produto)).toEqual([2, 4]);
    expect(p.novas).toBe(1);
    expect(p.alteradas).toBe(1);
    expect(p.iguais).toBe(1);
    expect(p.apagar).toEqual(['3']);
  });

  it('incremental: não apaga o que não veio; apaga só os que deixaram de ser peça', () => {
    const p = planejarEspelho([L(2, { Tipo: 'Óleo' })], existentes, 'incremental', ['3', '99']);
    expect(p.gravar.map((x) => x.codigo_produto)).toEqual([2]);
    expect(p.apagar).toEqual(['3']); // 99 não está no espelho
  });

  it('nada mudou = nada a gravar', () => {
    const p = planejarEspelho(existentes, existentes, 'completo');
    expect(p.gravar).toHaveLength(0);
    expect(p.apagar).toHaveLength(0);
    expect(p.iguais).toBe(3);
  });
});

describe('decidirModo', () => {
  const sp = (s: string) => new Date(`${s}-03:00`);
  it('domingo = completo', () => {
    expect(decidirModo(sp('2026-10-24T20:00:00'), sp('2026-10-25T20:00:00')).modo).toBe('completo');
  });
  it('sem rodada certa ou velha = completo', () => {
    expect(decidirModo(null, sp('2026-10-22T20:00:00')).modo).toBe('completo');
    expect(decidirModo(sp('2026-10-10T20:00:00'), sp('2026-10-22T20:00:00')).modo).toBe('completo');
  });
  it('dia útil = incremental desde o dia anterior à última certa', () => {
    const d = decidirModo(sp('2026-10-21T20:05:00'), sp('2026-10-22T20:00:00'));
    expect(d.modo).toBe('incremental');
    expect(d.desde).toBe('20/10/2026');
  });
  it('dataOmie usa Brasília', () => {
    expect(dataOmie(new Date('2026-10-23T02:30:00Z'))).toBe('22/10/2026');
  });
});
