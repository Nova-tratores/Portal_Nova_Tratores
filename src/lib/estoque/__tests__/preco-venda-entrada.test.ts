import { describe, it, expect } from 'vitest';
import { fatorDoTipo, custosUnitarios, sugerirPreco, deveGravar } from '../preco-venda-entrada';

describe('preço de venda na entrada', () => {
  it('fator por tipo: máquina 1,20, peça 2, resto nada', () => {
    expect(fatorDoTipo('maquinas')).toBe(1.2);
    expect(fatorDoTipo('pecas')).toBe(2);
    expect(fatorDoTipo('pecas_garantia')).toBeNull();
    expect(fatorDoTipo('almoxarifado')).toBeNull();
    expect(fatorDoTipo(null)).toBeNull();
  });

  it('reparte o total da nota (frete, IPI) pelo peso de cada item', () => {
    // 2 itens de R$ 100 + R$ 300, nota com R$ 40 de frete só no total = 440
    const c = custosUnitarios([
      { nSequencia: 1, qtde: 1, precoUnit: 100 },
      { nSequencia: 2, qtde: 3, precoUnit: 100 },
    ], 440);
    expect(c['1']).toBe(110);
    expect(c['2']).toBe(110);
  });

  it('IPI e desconto entram no peso do item; divide pela qtde de estoque', () => {
    // caso real NF 104745: 8 × 171 + IPI 44,46 = 1412,46, sozinho na nota
    const c = custosUnitarios([{ nSequencia: 1, qtde: 8, precoUnit: 171, valIPI: 44.46 }], 1412.46);
    expect(c['1']).toBeCloseTo(176.5575, 4);
    const cx = custosUnitarios([{ nSequencia: 1, qtde: 1, qtdeEstoque: 10, precoUnit: 100, vDesconto: 10 }], 90);
    expect(cx['1']).toBe(9);
  });

  it('sugere custo × fator e diz se sobe o preço atual', () => {
    expect(sugerirPreco(100, 2, 150)).toEqual({ novo: 200, atual: 150, sobe: true });
    expect(sugerirPreco(100, 1.2, 130)).toEqual({ novo: 120, atual: 130, sobe: false });
    expect(sugerirPreco(0, 2, 0)).toBeNull();
    expect(sugerirPreco(50, null, 0)).toBeNull();
  });

  it('servidor só grava se for maior que o preço na Omie', () => {
    expect(deveGravar(200, 150)).toBe(true);
    expect(deveGravar(150, 150)).toBe(false);
    expect(deveGravar(100, 150)).toBe(false);
    expect(deveGravar(0, 0)).toBe(false);
  });
});
