import { describe, it, expect } from 'vitest';
import { locacaoEtiqueta } from '../posicao';

describe('locacaoEtiqueta', () => {
  it('usa #ANDAR2/#CAIXA2 quando #ANDAR/#CAIXA estão vazios (caso BUJAO 81233900)', () => {
    expect(locacaoEtiqueta({ '#PRATELEIRA': '3', '#ANDAR2': 'E', '#CAIXA2': '2' })).toBe('PRATELEIRA 3 · ANDAR E · CAIXA 2');
  });
  it('a principal vence a secundária e placeholder some', () => {
    expect(locacaoEtiqueta({ '#Prateleira': '4', '#ANDAR': 'H', '#ANDAR2': 'Z', '#CAIXA': '000' })).toBe('PRATELEIRA 4 · ANDAR H');
  });
});
