import { describe, it, expect } from 'vitest';
import { podeTelaFrota, slugDaRota } from '../frota';

// Gate por tela do Frota (a camada de compat de chaves legadas foi removida
// em 16/07/2026 — verificado no banco: nenhum dos 23 usuários tinha chave
// antiga gravada).

describe('slugDaRota', () => {
  it('mapeia a URL para o slug da tela', () => {
    expect(slugDaRota('/frota')).toBe('dashboard');
    expect(slugDaRota('/frota/abastecimento')).toBe('abastecimento');
    expect(slugDaRota('/frota/abastecimento/flex')).toBe('abastecimento:flex');
  });

  it('/frota/veiculos (redirect da aba fundida) usa o gate da Visão geral', () => {
    expect(slugDaRota('/frota/veiculos')).toBe('dashboard');
  });

  it('sub-rota que NÃO é tela herda a permissão da tela pai', () => {
    // /frota/abastecimento/lotes não existe no catálogo -> cai em 'abastecimento'
    expect(slugDaRota('/frota/abastecimento/lotes')).toBe('abastecimento');
  });

  it('fora do módulo', () => {
    expect(slugDaRota('/requisicoes')).toBe('');
  });
});

describe('podeTelaFrota — o gate por prefixo', () => {
  it('admin passa em tudo', () => {
    expect(podeTelaFrota([], true, 'abastecimento')).toBe(true);
  });

  it('módulo puro passa em tudo', () => {
    expect(podeTelaFrota(['frota'], false, 'abastecimento:flex')).toBe(true);
  });

  it('⚠️ quem tem SÓ a ação de upload ainda vê a tela do abastecimento', () => {
    // Este é o caso que um `pode('frota','abastecimento')` cru BARRARIA — a
    // pessoa seria expulsa justamente da tela que tem permissão de usar.
    const perms = ['frota:abastecimento:upload'];
    expect(podeTelaFrota(perms, false, 'abastecimento')).toBe(true);
  });

  it('não vaza para telas que a pessoa não tem', () => {
    const perms = ['frota:abastecimento'];
    expect(podeTelaFrota(perms, false, 'multas')).toBe(false);
    expect(podeTelaFrota(perms, false, 'veiculos')).toBe(false);
  });

});
