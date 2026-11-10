import { describe, expect, it } from 'vitest';
import { casarValorPermitido } from '../posicao';

const ANDARES = ['A', 'B', 'C', 'H', 'XXX'];
const CAIXAS = ['01', '02', '04', '10'];

describe('casarValorPermitido', () => {
  it('aceita a grafia exata', () => {
    expect(casarValorPermitido('H', ANDARES)).toBe('H');
    expect(casarValorPermitido('04', CAIXAS)).toBe('04');
  });
  it('corrige maiúscula/espaço (caso da 54075/N: "h")', () => {
    expect(casarValorPermitido(' h ', ANDARES)).toBe('H');
    expect(casarValorPermitido('xxx', ANDARES)).toBe('XXX');
  });
  it('casa número sem o zero da frente (caixa "4" → "04")', () => {
    expect(casarValorPermitido('4', CAIXAS)).toBe('04');
    expect(casarValorPermitido('004', CAIXAS)).toBe('04');
    expect(casarValorPermitido('10', CAIXAS)).toBe('10');
  });
  it('valor fora da lista = null', () => {
    expect(casarValorPermitido('Z', ANDARES)).toBeNull();
    expect(casarValorPermitido('3', CAIXAS)).toBeNull();
  });
  it('vazio continua vazio; sem lista devolve o próprio valor', () => {
    expect(casarValorPermitido('  ', CAIXAS)).toBe('');
    expect(casarValorPermitido('7', [])).toBe('7');
    expect(casarValorPermitido('7', null)).toBe('7');
  });
});
