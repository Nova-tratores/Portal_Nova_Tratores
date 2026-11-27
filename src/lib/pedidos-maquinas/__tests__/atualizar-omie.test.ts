import { describe, it, expect } from 'vitest';
import { planoItensOmie, divergenciaItens, cfopVenda } from '../regras';

describe('atualizar pedido de máquina na Omie', () => {
  it('troca o produto: o novo entra com outro código de integração e o antigo sai com acao_item E', () => {
    const det = planoItensOmie(
      [{ produto: { codigo_produto: 222, quantidade: 1, valor_unitario: 50000 } }],
      [{ ide: { codigo_item: 9, codigo_item_integracao: 'PVM-0003-1' }, produto: { codigo_produto: 111, quantidade: 1, valor_unitario: 50000 } }],
      'PVM-0003', 'abc',
    );
    expect(det).toHaveLength(2);
    expect(det[0]).toMatchObject({ ide: { codigo_item_integracao: 'PVM-0003-abc-1' }, produto: { codigo_produto: 222 } });
    expect(det[1]).toMatchObject({ ide: { codigo_item: 9, acao_item: 'E' }, produto: { codigo_produto: 111 } });
  });

  it('mesmo produto reaproveita o item da Omie', () => {
    const det = planoItensOmie(
      [{ produto: { codigo_produto: 111, quantidade: 2 } }],
      [{ ide: { codigo_item: 9, codigo_item_integracao: 'PVM-0003-1' }, produto: { codigo_produto: 111, quantidade: 1 } }],
      'PVM-0003', 'abc',
    );
    expect(det).toEqual([{ ide: { codigo_item: 9, codigo_item_integracao: 'PVM-0003-1' }, produto: { codigo_produto: 111, quantidade: 2 } }]);
  });

  it('acusa produto diferente', () => {
    expect(divergenciaItens([{ codigo_produto: 1, qtde: 1 }], [{ produto: { codigo_produto: 1, quantidade: 1 } }])).toEqual([]);
    expect(divergenciaItens([{ codigo_produto: 2, qtde: 1 }], [{ produto: { codigo_produto: 1, quantidade: 1 } }])).toHaveLength(1);
  });

  it('item sem CFOP ganha o do item que sai ou o da UF do cliente', () => {
    const sai = planoItensOmie([{ produto: { codigo_produto: 2, quantidade: 1 } }], [{ ide: { codigo_item: 9 }, produto: { codigo_produto: 1, quantidade: 1, cfop: '5.102' } }], 'P', 'x', '6.102');
    expect((sai[0].produto as { cfop?: string }).cfop).toBe('5.102');
    const so = planoItensOmie([{ produto: { codigo_produto: 2, quantidade: 1 } }], [{ ide: { codigo_item: 9 }, produto: { codigo_produto: 2, quantidade: 1, cfop: '' } }], 'P', 'x', cfopVenda('SP'));
    expect((so[0].produto as { cfop?: string }).cfop).toBe('5.102');
    expect(cfopVenda('PR')).toBe('6.102');
  });
});
