import { describe, expect, it } from 'vitest';
import { agruparPorCategoria, explicarOrigem, profundidade, type TelaMatriz } from '../explicar';

describe('explicarOrigem', () => {
  it('traduz cada origem que perm_efetivas devolve', () => {
    expect(explicarOrigem('dev').tipo).toBe('dev');
    expect(explicarOrigem('admin').tipo).toBe('admin');
    expect(explicarOrigem('conjunto:Peças')).toEqual({ tipo: 'conjunto', texto: 'Herdada de Peças' });
    expect(explicarOrigem('conjunto:Peças · gerir ppv').texto).toBe('Herdada de Peças, porque tem ppv inteiro');
    expect(explicarOrigem('extra').texto).toBe('Extra individual');
    expect(explicarOrigem('extra até 31/12/2026').texto).toBe('Extra individual até 31/12/2026');
    expect(explicarOrigem('extra · por pos:criar').texto).toBe('Extra individual, porque tem pos:criar (dentro desta tela)');
    expect(explicarOrigem('bloqueio ver estoque')).toEqual({ tipo: 'bloqueio', texto: 'Bloqueio individual (ver estoque)' });
  });
});

describe('matriz', () => {
  const t = (id: string, categoria_menu: string): TelaMatriz =>
    ({ id, nome: id, categoria_menu, explicita: false, so_dev: false, nivel: null, origens: [] });

  it('agrupa por categoria com o pai antes dos filhos', () => {
    const g = agruparPorCategoria([t('pos:criar', 'Serviços'), t('ppv', 'Peças'), t('pos', 'Serviços')]);
    expect(g.map((c) => c.categoria)).toEqual(['Peças', 'Serviços']);
    expect(g[1].telas.map((x) => x.id)).toEqual(['pos', 'pos:criar']);
  });

  it('mede o recuo pelos dois-pontos', () => {
    expect(profundidade('pos')).toBe(0);
    expect(profundidade('frota:veiculos:editar')).toBe(2);
  });
});
