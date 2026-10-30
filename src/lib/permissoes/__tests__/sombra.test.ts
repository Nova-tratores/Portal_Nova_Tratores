import { describe, expect, it } from 'vitest';
import { agregar, decidirV2, modoV2, rotuloChecagem, telasDaChecagem } from '../sombra';

describe('sombra', () => {
  const ef = new Set(['pos', 'pos:criar', 'estoque', 'estoque:notas']);

  it('modo padrão é on; sombra e off só explícitos', () => {
    expect(modoV2(undefined)).toBe('on');
    expect(modoV2('sombra')).toBe('sombra');
    expect(modoV2('ON')).toBe('on');
    expect(modoV2('off')).toBe('off');
    expect(modoV2('qualquer')).toBe('on');
  });

  it('exigirPermissao/exigirAcessoModulo viram uma tela', () => {
    expect(telasDaChecagem({ tipo: 'permissao', modulo: 'pos', acao: 'faturar' })).toEqual(['pos:faturar']);
    expect(decidirV2({ tipo: 'permissao', modulo: 'pos', acao: 'criar' }, ef, false)).toBe(true);
    expect(decidirV2({ tipo: 'permissao', modulo: 'pos', acao: 'faturar' }, ef, false)).toBe(false);
    expect(decidirV2({ tipo: 'modulo', modulo: 'estoque' }, ef, false)).toBe(true);
    expect(decidirV2({ tipo: 'modulo', modulo: 'frota' }, ef, false)).toBe(false);
  });

  it('protegerRota: basta uma opção; {admin} usa a flag', () => {
    const rota = { tipo: 'rota' as const, opcoes: [{ modulo: 'frota' }, { modulo: 'estoque', acao: 'notas' }] };
    expect(decidirV2(rota, ef, false)).toBe(true);
    expect(rotuloChecagem(rota)).toBe('frota|estoque:notas');
    const soAdmin = { tipo: 'rota' as const, opcoes: [{ admin: true as const }] };
    expect(decidirV2(soAdmin, ef, false)).toBe(false);
    expect(decidirV2(soAdmin, ef, true)).toBe(true);
  });

  it('agrega itens iguais somando vezes', () => {
    const base = { dia: '2026-10-15', user_id: 'u', tela_id: 'pos', rota: '/api/pos', antigo: true, v2: true, catalogada: true, decidiu: 'antigo' as const };
    const r = agregar([base, base, { ...base, v2: false }]);
    expect(r).toHaveLength(2);
    expect(r.find((i) => i.v2)?.vezes).toBe(2);
  });
});
