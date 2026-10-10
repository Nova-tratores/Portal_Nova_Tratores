import { describe, it, expect } from 'vitest';
import { ehPosVendas } from '../notificados';

describe('ehPosVendas — quem vê o alerta do Tratorilson em janela', () => {
  it('categoria Pós Vendas (com ou sem variação de caixa/espaço)', () => {
    expect(ehPosVendas({ categoria: 'Pós Vendas', modulos: [] })).toBe(true);
    expect(ehPosVendas({ categoria: ' pós vendas ', modulos: [] })).toBe(true);
  });
  it('módulo pos dado explicitamente', () => {
    expect(ehPosVendas({ categoria: 'Comercial', modulos: ['ppv', 'pos'] })).toBe(true);
  });
  it('quem não é do pós-vendas (nem módulo granular de outra coisa) fica no sino', () => {
    expect(ehPosVendas({ categoria: 'Financeiro', modulos: ['frota', 'financeiro'] })).toBe(false);
    expect(ehPosVendas({ categoria: null, modulos: null })).toBe(false);
  });
});
