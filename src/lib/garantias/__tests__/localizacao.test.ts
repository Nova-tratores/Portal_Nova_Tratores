import { describe, it, expect } from 'vitest';
import { montarLocalizacao, partesLocalizacao, rotuloLocalizacao } from '../localizacao';

describe('localizacao da peça de garantia', () => {
  it('monta o código estante-prateleira', () => {
    expect(montarLocalizacao('MA1', 2)).toBe('MA1-P2');
    expect(montarLocalizacao(' ve1 ', 6)).toBe('VE1-P6');
  });

  it('monta o código com caixa (com e sem identificação)', () => {
    expect(montarLocalizacao('MA1', 2, true)).toBe('MA1-P2-CX');
    expect(montarLocalizacao('MA1', 2, true, ' azul ')).toBe('MA1-P2-CX:azul');
    expect(montarLocalizacao('MA1', 2, false, 'azul')).toBe('MA1-P2');
  });

  it('decompõe o código e rejeita texto fora do padrão', () => {
    expect(partesLocalizacao('MA1-P2')).toEqual({ estante: 'MA1', prateleira: 2, emCaixa: false, caixa: null });
    expect(partesLocalizacao('ma2-p10')).toEqual({ estante: 'MA2', prateleira: 10, emCaixa: false, caixa: null });
    expect(partesLocalizacao('MA1-P2-CX')).toEqual({ estante: 'MA1', prateleira: 2, emCaixa: true, caixa: null });
    expect(partesLocalizacao('ku1-p3-cx:C7')).toEqual({ estante: 'KU1', prateleira: 3, emCaixa: true, caixa: 'C7' });
    expect(partesLocalizacao('prateleira do fundo')).toBeNull();
    expect(partesLocalizacao('')).toBeNull();
    expect(partesLocalizacao(null)).toBeNull();
  });

  it('rótulo humano usa o nome da estante e diz a caixa', () => {
    expect(rotuloLocalizacao('MA1-P2')).toBe('MAHINDRA 1 · Prateleira 2');
    expect(rotuloLocalizacao('KU1-P1')).toBe('KUHN · Prateleira 1');
    expect(rotuloLocalizacao('MA1-P2-CX')).toBe('MAHINDRA 1 · Prateleira 2 · Em caixa');
    expect(rotuloLocalizacao('MA1-P2-CX:AZUL')).toBe('MAHINDRA 1 · Prateleira 2 · Caixa AZUL');
  });

  it('estante desconhecida mantém o código; texto livre volta cru; vazio vira vazio', () => {
    expect(rotuloLocalizacao('XX9-P3')).toBe('XX9 · Prateleira 3');
    expect(rotuloLocalizacao('caixa azul do corredor')).toBe('caixa azul do corredor');
    expect(rotuloLocalizacao(null)).toBe('');
  });
});
