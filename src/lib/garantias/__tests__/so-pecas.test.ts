import { describe, it, expect } from 'vitest';
import { validarNovaGarantiaSoPecas, normalizarPeca, numeroBR, ehSoPecas, refOS, totalPecas } from '../so-pecas';

describe('garantia só de peças', () => {
  it('exige motivo e pelo menos uma peça', () => {
    expect(validarNovaGarantiaSoPecas({ motivo: '', pecas: [{ descricao: 'Tinta' }] }).ok).toBe(false);
    expect(validarNovaGarantiaSoPecas({ motivo: 'Veio com defeito', pecas: [] }).ok).toBe(false);
    expect(validarNovaGarantiaSoPecas({ motivo: 'Veio com defeito', pecas: [{ descricao: '  ' }] }).ok).toBe(false);
  });

  it('cliente e trator são opcionais; chassi em maiúsculas', () => {
    const r = validarNovaGarantiaSoPecas({ motivo: 'Tinta descascando', chassis: ' mdi07 ', pecas: [{ descricao: 'Tinta vermelha Mahindra', quantidade: '2', preco_unitario: '1.290,50' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.cliente).toBeNull();
    expect(r.valor.chassis).toBe('MDI07');
    expect(r.valor.pecas[0]).toEqual({ cod_produto: null, descricao: 'Tinta vermelha Mahindra', quantidade: 2, preco_unitario: 1290.5 });
  });

  it('peça só com código usa o código como descrição; quantidade vazia = 1', () => {
    expect(normalizarPeca({ cod_produto: '0734309419' })).toEqual({ cod_produto: '0734309419', descricao: '0734309419', quantidade: 1, preco_unitario: 0 });
  });

  it('números em formato BR e US', () => {
    expect(numeroBR('1.290,50')).toBe(1290.5);
    expect(numeroBR('1290.5')).toBe(1290.5);
    expect(numeroBR('R$ 12,00')).toBe(12);
    expect(numeroBR('abc')).toBe(0);
  });

  it('sem OS = só peças; texto de referência', () => {
    expect(ehSoPecas({ id_ordem: null })).toBe(true);
    expect(ehSoPecas({ id_ordem: 'OS-0123' })).toBe(false);
    expect(refOS({ id_ordem: 'OS-0123' })).toBe('OS OS-0123');
    expect(refOS({ id_ordem: null })).toBe('só peças (sem OS)');
    expect(totalPecas([{ quantidade: 2, preco_unitario: 10.5 }, { quantidade: 1, preco_unitario: 3 }])).toBe(24);
  });
});
