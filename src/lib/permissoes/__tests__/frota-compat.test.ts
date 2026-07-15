import { describe, it, expect } from 'vitest';
import { expandirPermissoes } from '../compat';
import { podeTelaFrota, slugDaRota } from '../frota';

// Mover o Abastecimento pra dentro do Frota mexe em permissões JÁ GRAVADAS no
// banco de gente que usa o portal todo dia. Estes testes existem para garantir
// que NINGUÉM perde acesso — é o risco número 1 desta fase.

describe('expandirPermissoes — ninguém perde acesso', () => {
  it('quem tinha o módulo `abastecimento` inteiro ganha o submódulo inteiro', () => {
    const r = expandirPermissoes(['abastecimento']);
    expect(r).toContain('frota:abastecimento');
    expect(r).toContain('frota:abastecimento:flex');
    expect(r).toContain('frota:abastecimento:upload');
    // aditivo: a chave antiga continua lá (reversível)
    expect(r).toContain('abastecimento');
  });

  it('quem só via os relatórios NÃO ganha o upload', () => {
    const r = expandirPermissoes(['abastecimento:dashboard']);
    expect(r).toContain('frota:abastecimento');
    expect(r).toContain('frota:abastecimento:flex');
    expect(r).not.toContain('frota:abastecimento:upload'); // ← não pode escalar
  });

  it('quem importava o CSV mantém só o upload', () => {
    const r = expandirPermissoes(['abastecimento:upload']);
    expect(r).toContain('frota:abastecimento:upload');
  });

  it('quem tinha a tela do pátio (consulta-estoque:frota) vê a Visão geral do Frota', () => {
    // a tela de pátio foi descontinuada (13/07) — a Visão geral absorveu
    expect(expandirPermissoes(['consulta-estoque:frota'])).toContain('frota:dashboard');
  });

  it('quem tinha a aba Veículos (frota:veiculos) entra na Visão geral unificada', () => {
    // Veículos foi fundida na Visão geral (15/07) — ninguém perde acesso
    const r = expandirPermissoes(['frota:veiculos']);
    expect(r).toContain('frota:dashboard');
    expect(r).toContain('frota:veiculos'); // aditivo — a chave antiga fica
  });

  it('não inventa permissão pra quem não tinha nada', () => {
    expect(expandirPermissoes(['requisicoes'])).toEqual(['requisicoes']);
    expect(expandirPermissoes([])).toEqual([]);
    expect(expandirPermissoes(null)).toEqual([]);
  });
});

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

  it('cenário real: usuário legado com abastecimento:dashboard entra e navega', () => {
    const perms = expandirPermissoes(['abastecimento:dashboard']);
    expect(podeTelaFrota(perms, false, slugDaRota('/frota/abastecimento'))).toBe(true);
    expect(podeTelaFrota(perms, false, slugDaRota('/frota/abastecimento/flex'))).toBe(true);
    // ...mas não ganha o que não tinha
    expect(perms).not.toContain('frota:abastecimento:upload');
  });
});
