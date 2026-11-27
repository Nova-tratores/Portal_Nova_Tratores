import { describe, it, expect } from 'vitest';
import { padraoSemAcento, casaSemAcento } from '../busca-cliente';

describe('busca de cliente sem acento', () => {
  it('monta o curinga nas letras que podem ter acento', () => {
    expect(padraoSemAcento('Joao Aparecido')).toBe('j___%_p_r___d_');
    expect(padraoSemAcento('Sebastião')).toBe('s_b_st___');
  });
  it('não monta curinga solto demais', () => {
    expect(padraoSemAcento('ana')).toBeNull();
    expect(padraoSemAcento('OSÓRIO')).toBeNull();
    expect(padraoSemAcento('123')).toBeNull();
  });
  it('confere sem acento nos dois sentidos', () => {
    expect(casaSemAcento({ razao_social: 'João Aparecido Ribeiro' }, 'joao aparecido')).toBe(true);
    expect(casaSemAcento({ nome_fantasia: 'OSORIO RAMOS E OUTROS' }, 'OSÓRIO')).toBe(true);
    expect(casaSemAcento({ nome_fantasia: 'JOAQUIM' }, 'joao')).toBe(false);
  });
});
